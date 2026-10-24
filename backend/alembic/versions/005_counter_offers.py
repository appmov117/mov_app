"""Contraofertas del conductor sobre la tarifa estimada."""

from alembic import op

revision = "005_counter_offers"
down_revision = "004_safety"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE ride_offers
            ADD COLUMN proposed_fare NUMERIC(10, 2),
            ADD COLUMN countered_at TIMESTAMPTZ;
        ALTER TABLE ride_offers DROP CONSTRAINT IF EXISTS ride_offers_status_check;
        ALTER TABLE ride_offers ADD CONSTRAINT ride_offers_status_check CHECK (
            status IN ('pending', 'accepted', 'rejected', 'expired', 'countered', 'declined')
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE ride_offers SET status = 'expired' WHERE status IN ('countered', 'declined');
        ALTER TABLE ride_offers DROP CONSTRAINT IF EXISTS ride_offers_status_check;
        ALTER TABLE ride_offers ADD CONSTRAINT ride_offers_status_check CHECK (
            status IN ('pending', 'accepted', 'rejected', 'expired')
        );
        ALTER TABLE ride_offers DROP COLUMN IF EXISTS countered_at;
        ALTER TABLE ride_offers DROP COLUMN IF EXISTS proposed_fare;
        """
    )
