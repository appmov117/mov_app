"""Seis meses gratis de membresía para los conductores ya registrados, sumados a lo que tengan vigente."""

from alembic import op

revision = "012_free_months"
down_revision = "011_motos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO memberships (id, driver_id, starts_at, expires_at, amount, status)
        SELECT gen_random_uuid(), d.id, s.start, s.start + INTERVAL '180 days', 0, 'active'
        FROM drivers d
        CROSS JOIN LATERAL (
            SELECT GREATEST(NOW(), COALESCE(MAX(m.expires_at), NOW())) AS start
            FROM memberships m
            WHERE m.driver_id = d.id AND m.status = 'active'
        ) s;
        """
    )


def downgrade() -> None:
    # Los meses regalados no se distinguen de otras membresías gratuitas; no se revierten.
    pass
