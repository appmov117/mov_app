"""Mensajes entre pasajero y conductor durante el viaje."""

from alembic import op

revision = "006_ride_messages"
down_revision = "005_counter_offers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE ride_messages (
            id UUID PRIMARY KEY,
            ride_id UUID NOT NULL REFERENCES rides(id),
            sender_role TEXT NOT NULL CHECK (sender_role IN ('passenger', 'driver')),
            body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            read_at TIMESTAMPTZ
        );
        CREATE INDEX idx_ride_messages_ride ON ride_messages (ride_id, created_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ride_messages;")
