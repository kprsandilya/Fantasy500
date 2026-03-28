use std::collections::HashSet;
use std::sync::OnceLock;

static UNIVERSE: OnceLock<HashSet<String>> = OnceLock::new();

pub fn universe() -> &'static HashSet<String> {
    UNIVERSE.get_or_init(|| {
        let raw: Vec<String> =
            serde_json::from_str(include_str!("../data/fortune500.json")).expect("universe json");
        raw.into_iter().map(|s| s.to_uppercase()).collect()
    })
}

pub fn is_valid_symbol(sym: &str) -> bool {
    universe().contains(&sym.to_uppercase())
}
