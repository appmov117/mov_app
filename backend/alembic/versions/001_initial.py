"""Migración inicial: PostGIS y el modelo del MVP."""

from alembic import op

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None

SQL = r"""
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE passengers (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id),
    total_rides INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE drivers (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id),
    driver_status TEXT NOT NULL DEFAULT 'offline'
        CHECK (driver_status IN ('offline', 'online', 'busy', 'paused')),
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    completed_rides INTEGER NOT NULL DEFAULT 0,
    cancelled_rides INTEGER NOT NULL DEFAULT 0,
    paused_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicles (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    brand TEXT,
    model TEXT,
    year INTEGER,
    color TEXT,
    plate TEXT UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_documents (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    kind TEXT NOT NULL CHECK (kind IN ('identity', 'license', 'plate', 'vehicle_photo', 'driver_photo')),
    file_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_locations (
    driver_id UUID PRIMARY KEY REFERENCES drivers(id),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    heading NUMERIC,
    speed NUMERIC,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_location ON driver_locations USING GIST (location);

CREATE TABLE driver_sessions (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE TABLE referral_codes (
    driver_id UUID PRIMARY KEY REFERENCES drivers(id),
    code TEXT UNIQUE NOT NULL
);

CREATE TABLE ride_requests (
    id UUID PRIMARY KEY,
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    origin GEOGRAPHY(POINT, 4326) NOT NULL,
    destination GEOGRAPHY(POINT, 4326) NOT NULL,
    origin_label TEXT,
    destination_label TEXT,
    estimated_distance_m INTEGER,
    estimated_duration_s INTEGER,
    estimated_fare NUMERIC(10,2),
    route_geometry JSONB,
    wave INTEGER NOT NULL DEFAULT 0,
    wave_started_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'searching'
        CHECK (status IN ('searching', 'offered', 'accepted', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_ride_requests_status ON ride_requests (status);

CREATE TABLE ride_offers (
    id UUID PRIMARY KEY,
    ride_request_id UUID NOT NULL REFERENCES ride_requests(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE (ride_request_id, driver_id)
);

CREATE TABLE rides (
    id UUID PRIMARY KEY,
    ride_request_id UUID UNIQUE NOT NULL REFERENCES ride_requests(id),
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    origin GEOGRAPHY(POINT, 4326) NOT NULL,
    destination GEOGRAPHY(POINT, 4326) NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    distance_m INTEGER,
    duration_s INTEGER,
    fare_amount NUMERIC(10,2),
    payment_method TEXT CHECK (payment_method IN ('cash', 'driver_terminal', 'other')),
    status TEXT NOT NULL CHECK (status IN (
        'accepted', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed', 'cancelled'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rides_status ON rides (status);

CREATE TABLE ride_events (
    id BIGSERIAL PRIMARY KEY,
    ride_id UUID NOT NULL REFERENCES rides(id),
    event_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memberships (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 200,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE membership_payments (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    membership_id UUID REFERENCES memberships(id),
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('mercado_pago_link', 'bank_transfer')),
    reference TEXT,
    receipt_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE TABLE ratings (
    id UUID PRIMARY KEY,
    ride_id UUID UNIQUE NOT NULL REFERENCES rides(id),
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE complaints (
    id UUID PRIMARY KEY,
    ride_id UUID NOT NULL REFERENCES rides(id),
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    category TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id)
);

CREATE TABLE referrals (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    referred_user_id UUID NOT NULL REFERENCES users(id),
    referral_code TEXT NOT NULL,
    first_completed_ride_at TIMESTAMPTZ,
    reward_applied BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_rewards (
    id UUID PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    reward_key TEXT NOT NULL,
    days INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (driver_id, reward_key)
);

CREATE TABLE favorite_drivers (
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (passenger_id, driver_id)
);

CREATE TABLE saved_places (
    id UUID PRIMARY KEY,
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('home', 'work', 'other')),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS analytics_events, audit_logs, push_subscriptions, notifications,
            refresh_tokens, saved_places, favorite_drivers, driver_rewards, referrals, complaints,
            ratings, membership_payments, memberships, ride_events, rides, ride_offers,
            ride_requests, referral_codes, driver_sessions, driver_locations, driver_documents,
            vehicles, drivers, passengers, users CASCADE;
        """
    )
