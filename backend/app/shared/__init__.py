from importlib import import_module

_two_factor_module = import_module("app.shared.2fa")

build_provisioning_uri = _two_factor_module.build_provisioning_uri
build_qr_svg = _two_factor_module.build_qr_svg
generate_two_factor_secret = _two_factor_module.generate_two_factor_secret
verify_two_factor_code = _two_factor_module.verify_two_factor_code
