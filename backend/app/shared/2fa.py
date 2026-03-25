import io

import pyotp
import qrcode
import qrcode.image.svg

_ISSUER_NAME = "INSIGHT"
_VALID_WINDOW = 1


def generate_two_factor_secret() -> str:
    return pyotp.random_base32()


def build_totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret)


def build_provisioning_uri(secret: str, label_email: str) -> str:
    return build_totp(secret).provisioning_uri(
        name=label_email,
        issuer_name=_ISSUER_NAME,
    )


def verify_two_factor_code(secret: str, otp: str) -> bool:
    normalized_otp = "".join(ch for ch in str(otp or "") if ch.isdigit())
    if len(normalized_otp) != 6:
        return False
    return bool(build_totp(secret).verify(normalized_otp, valid_window=_VALID_WINDOW))


def build_qr_svg(provisioning_uri: str) -> str:
    image = qrcode.make(
        provisioning_uri,
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=8,
        border=2,
    )
    buffer = io.BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode("utf-8")
