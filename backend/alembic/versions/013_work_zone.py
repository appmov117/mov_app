"""Zona de trabajo del conductor: círculo con centro y radio, y si está activa."""

from alembic import op

revision = "013_work_zone"
down_revision = "012_free_months"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE drivers
            ADD COLUMN work_zone_center GEOGRAPHY(POINT, 4326),
            ADD COLUMN work_zone_radius_m INTEGER CHECK (work_zone_radius_m BETWEEN 1000 AND 10000),
            ADD COLUMN work_zone_active BOOLEAN NOT NULL DEFAULT FALSE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE drivers
            DROP COLUMN work_zone_active,
            DROP COLUMN work_zone_radius_m,
            DROP COLUMN work_zone_center;
        """
    )
