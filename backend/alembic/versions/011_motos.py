"""Tipo de vehículo (auto o moto) y servicio pedido en cada solicitud de viaje."""

from alembic import op

revision = "011_motos"
down_revision = "010_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE vehicles
            ADD COLUMN kind TEXT NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto', 'moto'));
        ALTER TABLE ride_requests
            ADD COLUMN service TEXT NOT NULL DEFAULT 'auto' CHECK (service IN ('auto', 'moto', 'paquete'));
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE ride_requests DROP COLUMN service;
        ALTER TABLE vehicles DROP COLUMN kind;
        """
    )
