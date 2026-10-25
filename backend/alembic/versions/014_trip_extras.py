"""Código de seguridad, preferencias y datos de pago del conductor, precio del pasajero, recargos y envíos."""

from alembic import op

revision = "014_trip_extras"
down_revision = "013_work_zone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE drivers
            ADD COLUMN require_pin BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN payout JSONB,
            ADD COLUMN amenities JSONB;
        ALTER TABLE ride_requests
            ADD COLUMN min_fare NUMERIC(10, 2),
            ADD COLUMN surcharge_percent INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN surcharge_label TEXT,
            ADD COLUMN package JSONB,
            ADD COLUMN delivery_code TEXT,
            DROP CONSTRAINT ride_requests_service_check,
            ADD CONSTRAINT ride_requests_service_check
                CHECK (service IN ('auto', 'moto', 'paquete', 'paquete_moto'));
        ALTER TABLE rides
            ADD COLUMN start_pin TEXT,
            ADD COLUMN delivery_photo_key TEXT;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rides DROP COLUMN delivery_photo_key, DROP COLUMN start_pin;
        ALTER TABLE ride_requests
            DROP CONSTRAINT ride_requests_service_check,
            ADD CONSTRAINT ride_requests_service_check CHECK (service IN ('auto', 'moto', 'paquete')),
            DROP COLUMN delivery_code, DROP COLUMN package, DROP COLUMN surcharge_label,
            DROP COLUMN surcharge_percent, DROP COLUMN min_fare;
        ALTER TABLE drivers DROP COLUMN amenities, DROP COLUMN payout, DROP COLUMN require_pin;
        """
    )
