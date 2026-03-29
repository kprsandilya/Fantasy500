//! On-chain integrity for Fantasy500: league parameters, escrow to the league PDA,
//! draft pick commitments, roster roots, and commissioner payouts.
//!
//! Gameplay and scoring stay off-chain; this program anchors actions that need
//! verifiable ordering and fund custody.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;

declare_id!("HkZRTjyhTBERS5Q7WVQd2ruFscaB5ZAbLyt9USG6XAcb");

#[program]
pub mod fantasy_league {
    use super::*;

    pub fn initialize_league(
        ctx: Context<InitializeLeague>,
        buy_in_lamports: u64,
        max_teams: u8,
    ) -> Result<()> {
        require!(max_teams >= 2 && max_teams <= 32, ErrorCode::BadTeamCount);
        let league = &mut ctx.accounts.league;
        league.admin = ctx.accounts.admin.key();
        league.buy_in = buy_in_lamports;
        league.max_teams = max_teams;
        league.pick_counter = 0;
        league.bump = ctx.bumps.league;
        Ok(())
    }

    /// Escrows the configured buy-in into the league PDA (lamports sit on the account).
    pub fn deposit_buy_in(ctx: Context<DepositBuyIn>) -> Result<()> {
        let league = &ctx.accounts.league;
        let ix = system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.league.key(),
            league.buy_in,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.league.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        Ok(())
    }

    pub fn record_draft_pick(
        ctx: Context<RecordDraftPick>,
        pick_index: u32,
        pick_hash: [u8; 32],
    ) -> Result<()> {
        let league = &mut ctx.accounts.league;
        require_keys_eq!(league.admin, ctx.accounts.admin.key());
        require!(pick_index == league.pick_counter, ErrorCode::PickOrder);
        league.pick_counter = league.pick_counter.saturating_add(1);
        emit!(DraftPickRecorded {
            league: league.key(),
            pick_index,
            pick_hash,
        });
        Ok(())
    }

    pub fn commit_roster(ctx: Context<CommitRoster>, week_index: u32, roster_root: [u8; 32]) -> Result<()> {
        emit!(RosterCommitted {
            team: ctx.accounts.team.key(),
            week_index,
            roster_root,
        });
        Ok(())
    }

    pub fn distribute_payout(ctx: Context<DistributePayout>, amount: u64) -> Result<()> {
        **ctx.accounts.league.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeLeague<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + League::INIT_SPACE,
        seeds = [b"league", admin.key().as_ref()],
        bump
    )]
    pub league: Account<'info, League>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositBuyIn<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"league", league.admin.as_ref()], bump = league.bump)]
    pub league: Account<'info, League>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordDraftPick<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub league: Account<'info, League>,
}

#[derive(Accounts)]
pub struct CommitRoster<'info> {
    pub owner: Signer<'info>,
    /// CHECK: team PDA in a full deployment
    pub team: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DistributePayout<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub league: Account<'info, League>,
    /// CHECK: payout destination
    #[account(mut)]
    pub winner: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct League {
    pub admin: Pubkey,
    pub buy_in: u64,
    pub max_teams: u8,
    pub pick_counter: u32,
    pub bump: u8,
}

impl League {
    pub const INIT_SPACE: usize = 32 + 8 + 1 + 4 + 1;
}

#[event]
pub struct DraftPickRecorded {
    pub league: Pubkey,
    pub pick_index: u32,
    pub pick_hash: [u8; 32],
}

#[event]
pub struct RosterCommitted {
    pub team: Pubkey,
    pub week_index: u32,
    pub roster_root: [u8; 32],
}

#[error_code]
pub enum ErrorCode {
    #[msg("Team count must be between 2 and 32")]
    BadTeamCount,
    #[msg("Pick submitted out of order")]
    PickOrder,
}
