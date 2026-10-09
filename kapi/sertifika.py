"""Yerel sertifika otoritesi (yalnız demo içindir).

İlk çalıştırmada kapi/veri/sertifikalar/ altına üretir:
  ca.pem / ca-anahtar.pem          Miselyum Demo CA (10 yıl)
  sunucu.pem / sunucu-anahtar.pem   127.0.0.1 ve localhost için OCPP sunucu sertifikası (1 yıl)
  cihaz-<kimlik>.pem / -anahtar     OCPP Güvenlik Profili 3 cihazları için istemci sertifikası (karşılıklı TLS)

Gerçek kurulumda cihaz sertifikaları üreticinin ya da işletmecinin PKI'sından gelir ve OCPP'nin
SignCertificate / CertificateSigned mesajlarıyla yenilenir (ISO 27001 Ek A 8.24, 8.9).
"""
import datetime
import ipaddress
import os

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

KLASOR = os.path.join(os.environ.get('MISELYUM_VERI') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'veri'), 'sertifikalar')


def _yaz(yol, nesne, anahtar=False):
    with open(yol, 'wb') as f:
        if anahtar:
            f.write(nesne.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        else:
            f.write(nesne.public_bytes(serialization.Encoding.PEM))


def _oku():
    with open(os.path.join(KLASOR, 'ca.pem'), 'rb') as f:
        ca = x509.load_pem_x509_certificate(f.read())
    with open(os.path.join(KLASOR, 'ca-anahtar.pem'), 'rb') as f:
        anahtar = serialization.load_pem_private_key(f.read(), password=None)
    return ca, anahtar


def _imzala(ad, ca, ca_anahtar, gun, sunucu=False):
    anahtar = ec.generate_private_key(ec.SECP256R1())
    simdi = datetime.datetime.now(datetime.timezone.utc)
    b = (x509.CertificateBuilder()
         .subject_name(x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Miselyum Demo'), x509.NameAttribute(NameOID.COMMON_NAME, ad)]))
         .issuer_name(ca.subject).public_key(anahtar.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(simdi - datetime.timedelta(minutes=5)).not_valid_after(simdi + datetime.timedelta(days=gun))
         .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
         .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False, data_encipherment=False,
                                      key_agreement=True, key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(anahtar.public_key()), critical=False)
         .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_anahtar.public_key()), critical=False))
    if sunucu:
        b = b.add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'), x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), critical=False)
        b = b.add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
    else:
        b = b.add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
    return b.sign(ca_anahtar, hashes.SHA256()), anahtar


def hazirla(cihazlar=()):
    """CA ve sunucu sertifikası yoksa üretir; verilen cihaz kimlikleri için istemci sertifikası üretir. Yolları döndürür."""
    os.makedirs(KLASOR, exist_ok=True)
    ca_yol = os.path.join(KLASOR, 'ca.pem')
    if not os.path.exists(ca_yol):
        anahtar = ec.generate_private_key(ec.SECP256R1())
        ad = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Miselyum Demo'), x509.NameAttribute(NameOID.COMMON_NAME, 'Miselyum Demo CA')])
        simdi = datetime.datetime.now(datetime.timezone.utc)
        ca = (x509.CertificateBuilder().subject_name(ad).issuer_name(ad).public_key(anahtar.public_key())
              .serial_number(x509.random_serial_number()).not_valid_before(simdi - datetime.timedelta(minutes=5))
              .not_valid_after(simdi + datetime.timedelta(days=3650))
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False, data_encipherment=False,
                                           key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(anahtar.public_key()), critical=False)
              .sign(anahtar, hashes.SHA256()))
        _yaz(ca_yol, ca)
        _yaz(os.path.join(KLASOR, 'ca-anahtar.pem'), anahtar, True)
    ca, ca_anahtar = _oku()
    if not os.path.exists(os.path.join(KLASOR, 'sunucu.pem')):
        s, k = _imzala('127.0.0.1', ca, ca_anahtar, 365, sunucu=True)
        _yaz(os.path.join(KLASOR, 'sunucu.pem'), s)
        _yaz(os.path.join(KLASOR, 'sunucu-anahtar.pem'), k, True)
    for c in cihazlar:
        yol = os.path.join(KLASOR, 'cihaz-' + c + '.pem')
        if not os.path.exists(yol):
            s, k = _imzala(c, ca, ca_anahtar, 365)
            _yaz(yol, s)
            _yaz(os.path.join(KLASOR, 'cihaz-' + c + '-anahtar.pem'), k, True)
    return {'ca': ca_yol, 'sunucu': os.path.join(KLASOR, 'sunucu.pem'), 'sunucu_anahtar': os.path.join(KLASOR, 'sunucu-anahtar.pem'), 'klasor': KLASOR}
