//! Instruction payloads for the Anchor program `fantasy_league`.
//! Each payload is: 8-byte Anchor discriminator + Borsh-encoded args (no outer enum tag).

use borsh::BorshSerialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use solana_sdk::pubkey::Pubkey;

use crate::config::Config;
use crate::error::{AppError, AppResult};

#[derive(BorshSerialize)]
pub struct InitializeLeagueArgs {
    pub buy_in_lamports: u64,
    pub max_teams: u8,
}

#[derive(BorshSerialize)]
pub struct RecordDraftPickArgs {
    pub pick_index: u32,
    pub pick_hash: [u8; 32],
}

#[derive(BorshSerialize)]
pub struct CommitRosterArgs {
    pub week_index: u32,
    pub roster_root: [u8; 32],
}

fn anchor_discriminator(name: &str) -> [u8; 8] {
    let preimage = format!("global:{name}");
    let hash = Sha256::digest(preimage.as_bytes());
    hash[..8].try_into().expect("8 bytes")
}

fn encode_args(name: &str, args: impl BorshSerialize) -> AppResult<Vec<u8>> {
    let mut data = Vec::new();
    data.extend_from_slice(&anchor_discriminator(name));
    args.serialize(&mut data)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(data)
}

#[derive(Serialize)]
pub struct InstructionDraft {
    pub program_id: String,
    pub instruction_name: String,
    pub data_base64: String,
}

pub fn program_pubkey(cfg: &Config) -> AppResult<Pubkey> {
    cfg.program_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid PROGRAM_ID".into()))
}

pub fn init_league_instruction(
    cfg: &Config,
    buy_in_lamports: u64,
    max_teams: u8,
) -> AppResult<InstructionDraft> {
    let bytes = encode_args(
        "initialize_league",
        InitializeLeagueArgs {
            buy_in_lamports,
            max_teams,
        },
    )?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(InstructionDraft {
        program_id: cfg.program_id.clone(),
        instruction_name: "initialize_league".into(),
        data_base64: STANDARD.encode(bytes),
    })
}

pub fn record_pick_instruction(
    cfg: &Config,
    pick_index: u32,
    pick_hash: [u8; 32],
) -> AppResult<InstructionDraft> {
    let bytes = encode_args(
        "record_draft_pick",
        RecordDraftPickArgs {
            pick_index,
            pick_hash,
        },
    )?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(InstructionDraft {
        program_id: cfg.program_id.clone(),
        instruction_name: "record_draft_pick".into(),
        data_base64: STANDARD.encode(bytes),
    })
}

pub fn deposit_buy_in_instruction(cfg: &Config) -> AppResult<InstructionDraft> {
    let bytes = encode_args("deposit_buy_in", ())?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(InstructionDraft {
        program_id: cfg.program_id.clone(),
        instruction_name: "deposit_buy_in".into(),
        data_base64: STANDARD.encode(bytes),
    })
}

pub fn commit_roster_instruction(
    cfg: &Config,
    week_index: u32,
    roster_root: [u8; 32],
) -> AppResult<InstructionDraft> {
    let bytes = encode_args(
        "commit_roster",
        CommitRosterArgs {
            week_index,
            roster_root,
        },
    )?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(InstructionDraft {
        program_id: cfg.program_id.clone(),
        instruction_name: "commit_roster".into(),
        data_base64: STANDARD.encode(bytes),
    })
}

#[derive(BorshSerialize)]
pub struct DistributePayoutArgs {
    pub amount: u64,
}

pub fn distribute_payout_instruction(
    cfg: &Config,
    amount: u64,
) -> AppResult<InstructionDraft> {
    let bytes = encode_args(
        "distribute_payout",
        DistributePayoutArgs { amount },
    )?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(InstructionDraft {
        program_id: cfg.program_id.clone(),
        instruction_name: "distribute_payout".into(),
        data_base64: STANDARD.encode(bytes),
    })
}

/// League PDA address: seeds = [b"league", admin_pubkey].
pub fn league_pda(cfg: &Config, admin: &str) -> AppResult<String> {
    let program = program_pubkey(cfg)?;
    let admin_pk: Pubkey = admin
        .parse()
        .map_err(|_| AppError::BadRequest("invalid admin wallet".into()))?;
    let (pda, _bump) = Pubkey::find_program_address(
        &[b"league", admin_pk.as_ref()],
        &program,
    );
    Ok(pda.to_string())
}
