use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

const GEMINI_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<Content>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Serialize)]
struct Content {
    role: String,
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Option<CandidateContent>,
}

#[derive(Deserialize)]
struct CandidateContent {
    parts: Option<Vec<CandidatePart>>,
}

#[derive(Deserialize)]
struct CandidatePart {
    text: Option<String>,
}

pub async fn generate_summary(api_key: &str, prompt: &str) -> Result<String, AppError> {
    let body = GeminiRequest {
        contents: vec![Content {
            role: "user".into(),
            parts: vec![Part {
                text: prompt.into(),
            }],
        }],
        generation_config: GenerationConfig {
            temperature: 0.7,
            max_output_tokens: 2048,
        },
    };

    let resp = Client::new()
        .post(format!("{}?key={}", GEMINI_URL, api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Gemini request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "Gemini API {status}: {text}"
        )));
    }

    let data: GeminiResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Gemini parse error: {e}")))?;

    let text = data
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|p| p.into_iter().next())
        .and_then(|p| p.text)
        .unwrap_or_default();

    Ok(text)
}
