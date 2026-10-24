"""Alertas de pánico y grabaciones de seguridad del pasajero."""

from alembic import op

revision = "004_safety"
down_revision = "003_bidirectional_ratings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE safety_alerts (
            id UUID PRIMARY KEY,
            ride_id UUID NOT NULL REFERENCES rides(id),
            passenger_id UUID NOT NULL REFERENCES passengers(id),
            driver_id UUID REFERENCES drivers(id),
            location GEOGRAPHY(POINT, 4326),
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'attended')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            attended_at TIMESTAMPTZ,
            attended_by UUID REFERENCES users(id)
        );
        CREATE INDEX idx_safety_alerts_status ON safety_alerts (status, created_at DESC);
        CREATE INDEX idx_safety_alerts_location ON safety_alerts USING GIST (location);

        CREATE TABLE safety_recordings (
            id UUID PRIMARY KEY,
            ride_id UUID NOT NULL REFERENCES rides(id),
            passenger_id UUID NOT NULL REFERENCES passengers(id),
            session_id UUID NOT NULL,
            segment INTEGER NOT NULL DEFAULT 0,
            kind TEXT NOT NULL CHECK (kind IN ('audio', 'video')),
            file_url TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX idx_safety_recordings_ride ON safety_recordings (ride_id, created_at);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS safety_recordings;
        DROP TABLE IF EXISTS safety_alerts;
        """
    )
