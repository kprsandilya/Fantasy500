use mongodb::Database;
use mongodb::IndexModel;
use mongodb::options::IndexOptions;

pub async fn ensure_indexes(db: &Database) -> anyhow::Result<()> {
    let users = db.collection::<shared::User>("users");
    users
        .create_index(
            IndexModel::builder()
                .keys(mongodb::bson::doc! { "wallet": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await?;

    let teams = db.collection::<shared::Team>("teams");
    teams
        .create_index(
            IndexModel::builder()
                .keys(mongodb::bson::doc! { "league_id": 1, "owner_wallet": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await?;

    Ok(())
}
