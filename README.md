App Setup: https://fhir.epic.com/Developer/Apps

Application Name -> FHIR Backend Integration

Application Audience -> Backend Systems

Public Documentation URL -> example.com

Incoming APIs:

system/Patient.read (R4) (Release 4)
system/Observation.read
system/Encounter.read
system/MedicationRequest.read

Sandbox JWT Signing Public Key: (steps)

Steps to Generate a Valid X.509 Public Key Certificate
Generate an RSA Key Pair Run the following command to generate a private RSA key with a length of 2048 bits:

openssl genrsa -out private_key.pem 2048

Create a Certificate Signing Request (CSR) Use the private key to create a Certificate Signing Request (CSR):

openssl req -new -key private_key.pem -out certificate.csr

You will be prompted to enter information like your country, organization name, and common name (e.g., your domain or app name).
Self-Sign the Certificate Create a self-signed X.509 certificate using the CSR:

openssl x509 -req -days 365 -in certificate.csr -signkey private_key.pem -out public_cert.pem

This creates a public certificate in X.509 format (public_cert.pem) valid for 365 days.
Check the Certificate Format Ensure the public certificate is in Base64-encoded X.509 format:

openssl x509 -in public_cert.pem -text -noout

Upload the Public Certificate
Use the public_cert.pem file when uploading the JWT signing public key in the Epic FHIR App configuration.

Intended Purposes
Patient-Provider Communication

Intended Users
Clinical Team Healthcare Administrator/Executive Individual/Caregiver

Save and Ready for sandbox

https://fhir.epic.com/Documentation?docId=testpatients
