"""Distancia y tiempo por calles del conductor al punto de recogida, guardados al ofrecer el viaje."""

from alembic import op

revision = "008_offer_road_eta"
down_revision = "007_admin_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE ride_offers
            ADD COLUMN pickup_distance_m INTEGER,
            ADD COLUMN pickup_eta_s INTEGER;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE ride_offers DROP COLUMN pickup_eta_s, DROP COLUMN pickup_distance_m;")
