## Epic FHIR Backend Integration App Setup

This guide explains how to set up the **FHIR Backend Integration** app for Epic’s FHIR API, configure incoming APIs, and generate the required JWT signing public key certificate for the sandbox.

---

## App Configuration

- **Application Name:** FHIR Backend Integration
- **Application Audience:** Backend Systems
- **Public Documentation URL:** [example.com](https://example.com)

---

## Incoming APIs

The following APIs will be available to your application:

- `system/Patient.read` (R4)
- `system/Observation.read`
- `system/Encounter.read`
- `system/MedicationRequest.read` (all .read, search apis for testing)

---

## Sandbox JWT Signing Public Key Setup

To securely communicate with Epic, you need to generate and upload a valid X.509 public key certificate. Follow these steps:

### 1. Generate an RSA Key Pair

Generate a private RSA key (2048 bits):

```bash
openssl genrsa -out private_key.pem 2048
```

### 2. Create a Certificate Signing Request (CSR)

Use the generated private key to create a CSR. You will be prompted for details such as country, organization name, and common name (typically your domain or app name):

```bash
openssl req -new -key private_key.pem -out certificate.csr
```

### 3. Self-Sign the Certificate

Create a self-signed X.509 certificate using the CSR. The certificate will be valid for 365 days:

```bash
openssl x509 -req -days 365 -in certificate.csr -signkey private_key.pem -out public_cert.pem
```

### 4. Verify the Certificate Format

Ensure that the public certificate is in Base64-encoded X.509 format:

```bash
openssl x509 -in public_cert.pem -text -noout
```

### 5. Upload the Public Certificate

Use the generated `public_cert.pem` file when uploading your JWT signing public key in the Epic FHIR App configuration.

---

## Intended Use

- **Purpose:** Patient-Provider Communication
- **Intended Users:**
  - Clinical Teams
  - Healthcare Administrators/Executives
  - Individual Caregivers

---

## Final Steps

Once you have configured your app and uploaded the public certificate, save your settings. Your app is now ready to interact with Epic’s FHIR sandbox.

For more information, please refer to the [Epic FHIR Sandbox Documentation](https://fhir.epic.com/Documentation?docId=testpatients).
