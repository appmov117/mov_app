"""Importa los modelos para que Alembic conozca el metadata."""


def load_models() -> None:
    from app.analytics import models as analytics_models
    from app.auth import models as auth_models
    from app.complaints import models as complaint_models
    from app.drivers import models as driver_models
    from app.locations import models as location_models
    from app.memberships import models as membership_models
    from app.messages import models as message_models
    from app.notifications import models as notification_models
    from app.passengers import models as passenger_models
    from app.ratings import models as rating_models
    from app.referrals import models as referral_models
    from app.rides import models as ride_models
    from app.safety import models as safety_models
    from app.users import models as user_models
    from app.vehicles import models as vehicle_models

    _ = (
        analytics_models,
        auth_models,
        complaint_models,
        driver_models,
        location_models,
        membership_models,
        message_models,
        notification_models,
        passenger_models,
        rating_models,
        referral_models,
        ride_models,
        safety_models,
        user_models,
        vehicle_models,
    )
