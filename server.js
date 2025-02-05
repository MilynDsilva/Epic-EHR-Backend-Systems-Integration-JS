/* Load environment variables from .env */
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');

/* Read environment variables */
const CLIENT_ID = process.env.EPIC_CLIENT_ID;
const ISSUER = process.env.ISSUER; // Often the same as the client_id
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH;
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const PORT = process.env.PORT || 3000;

/* Epic endpoints (these could also come from .env if desired) */
const EPIC_TOKEN_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token';
// R4 base endpoint for most operations including Observation.Create
const EPIC_FHIR_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4';
// STU3 base endpoint for Appointment $find operation
const EPIC_STU3_FHIR_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/STU3';

/*
   Step 1: Generate a JWT for the client assertion
*/
function generateJWT() {
    const payload = {
        iss: ISSUER,
        sub: CLIENT_ID,
        aud: EPIC_TOKEN_URL, // Audience should be the token endpoint
        exp: Math.floor(Date.now() / 1000) + 300, // Expires in 5 minutes
        jti: Math.random().toString(36).substring(2) // Unique JWT ID
    };

    console.log('JWT Payload:', payload);
    const token = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' });
    console.log('JWT Token:', token);
    return token;
}

/*
   Step 2: Get an access token from Epic's OAuth server
*/
async function getAccessToken() {
    const jwtToken = generateJWT();

    // Parameters for JWT client assertion flow
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    params.append('client_assertion', jwtToken);

    console.log(params.toString(), 'Form URL Encoded Params');

    try {
        const response = await axios.post(EPIC_TOKEN_URL, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log('Token response:', response.data);
        return response.data.access_token;
    } catch (error) {
        console.error(
            'Error fetching access token:',
            error.response ? error.response.data : error.message
        );
        throw error;
    }
}

/*
   Helper function: Call Epic FHIR APIs using GET requests (for R4 endpoints)
*/
async function callEpicAPI(endpoint, accessToken) {
    try {
        const response = await axios.get(`${EPIC_FHIR_URL}/${endpoint}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(
            'Error calling Epic API:',
            error.response ? error.response.data : error.message
        );
        throw error;
    }
}

/*
   Helper function: Call Epic FHIR API for Patient $match (POST)
*/
async function callEpicAPIPatientMatch(matchParameters, accessToken) {
    try {
        console.log('Match Parameters:', matchParameters);
        const response = await axios.post(`${EPIC_FHIR_URL}/Patient/$match`, matchParameters, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(
            'Error calling Epic API (Patient $match):',
            error.response ? error.response.data : error.message
        );
        throw error;
    }
}

/*
   Helper function: Call Epic FHIR API for Appointment $find (STU3)
   This operation is a POST that returns potential appointment slots.
*/
async function callEpicAPIAppointmentFind(findParameters, accessToken) {
    try {
        console.log('Appointment $find Parameters:', findParameters);
        const response = await axios.post(`${EPIC_STU3_FHIR_URL}/Appointment/$find`, findParameters, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(
            'Error calling Epic API (Appointment $find):',
            error.response ? error.response.data : error.message
        );
        throw error;
    }
}

const app = express();

// IMPORTANT: Use body-parsing middleware
app.use(express.json());

/* GET /patient
   A simple route to read a patient by a known patient ID.
*/
app.get('/patient', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // Replace this with a valid patient ID
        const patientId = 'erXuFYUfucBZaryVksYEcMg3';
        const patientData = await callEpicAPI(`Patient/${patientId}`, accessToken);

        res.json({
            success: true,
            message: 'Data fetched successfully',
            data: patientData
        });
    } catch (error) {
        console.error('Error in /patient route:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching data',
            error: error.message
        });
    }
});

/* POST /patient-match
   Allows the client to send a Patient demographic in the request body
   to match a single high-confidence patient record via $match.
*/
app.post('/patient-match', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // matchParameters (FHIR "Parameters" resource) should be in the request body as JSON
        const matchParameters = req.body;
        console.log('Request Body:', req.body);
        const matchResults = await callEpicAPIPatientMatch(matchParameters, accessToken);

        res.json({
            success: true,
            message: 'Patient match results retrieved successfully',
            data: matchResults
        });
    } catch (error) {
        console.error('Error in /patient-match route:', error);
        res.status(500).json({
            success: false,
            message: 'Error matching patient',
            error: error.response ? error.response.data : error.message
        });
    }
});

/* GET /patient-search
   Allows the client to search for patients using query parameters.
   Example query: ?family=Lopez&gender=Female&telecom=469-555-5555
   ?family=Mychart&gender=Female&telecom=608-123-4567
*/
app.get('/patient-search', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // Build a query string from the incoming query parameters
        const queryParams = new URLSearchParams(req.query).toString();
        const endpoint = `Patient?${queryParams}`;
        console.log('Patient Search Endpoint:', endpoint);

        const searchResults = await callEpicAPI(endpoint, accessToken);

        res.json({
            success: true,
            message: 'Patient search results retrieved successfully',
            data: searchResults
        });
    } catch (error) {
        console.error('Error in /patient-search route:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching patient',
            error: error.response ? error.response.data : error.message
        });
    }
});

/* GET /appointments
   Allows the client to search for appointments for a patient using query parameters.
   Accepted query parameters include:
     - patient (required): The patient FHIR ID reference.
     - date: Appointment date.
     - identifier: Appointment identifier (CSN).
     - status: Appointment status.
     - service-category: The type of appointment (e.g., "appointment" or "surgery").
     ?patient=erXuFYUfucBZaryVksYEcMg3&service-category=appointment&date=2017-10-06
     or category = surgery
*/
app.get('/appointments', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // Build the query string from incoming query parameters
        const queryParams = new URLSearchParams(req.query).toString();
        const endpoint = `Appointment?${queryParams}`;
        console.log('Appointment Search Endpoint:', endpoint);

        const appointmentResults = await callEpicAPI(endpoint, accessToken);

        res.json({
            success: true,
            message: 'Appointment search results retrieved successfully',
            data: appointmentResults
        });
    } catch (error) {
        console.error('Error in /appointments route:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving appointments',
            error: error.response ? error.response.data : error.message
        });
    }
});

/* GET /scheduled-surgery/:id
   Allows the client to read a scheduled surgical appointment (using the Appointment.Read API for scheduled surgeries).
*/
app.get('/scheduled-surgery/:id', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // Get the surgery (appointment) ID from the URL parameter
        const surgeryId = req.params.id;
        const endpoint = `Appointment/${surgeryId}`;
        console.log('Scheduled Surgery Read Endpoint:', endpoint);

        const surgeryData = await callEpicAPI(endpoint, accessToken);

        res.json({
            success: true,
            message: 'Scheduled surgery appointment retrieved successfully',
            data: surgeryData
        });
    } catch (error) {
        console.error('Error in /scheduled-surgery route:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving scheduled surgery appointment',
            error: error.response ? error.response.data : error.message
        });
    }
});

/* POST /appointment-find
   Allows the client to search for potential appointment slots using the Appointment $find operation (STU3).
   The client should supply a FHIR Parameters resource (with fields such as patient, startTime, endTime, serviceType, indications, and location-reference).
*/
app.post('/appointment-find', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        const findParameters = req.body;
        console.log('Appointment $find Request Body:', findParameters);

        const findResults = await callEpicAPIAppointmentFind(findParameters, accessToken);

        res.json({
            success: true,
            message: 'Appointment $find results retrieved successfully',
            data: findResults
        });
    } catch (error) {
        console.error('Error in /appointment-find route:', error);
        res.status(500).json({
            success: false,
            message: 'Error finding appointment slots',
            error: error.response ? error.response.data : error.message
        });
    }
});

/* POST /observation
   Allows the client to create an observation (vital signs) using the Observation.Create API.
   This endpoint files a vital sign reading to the appropriate flowsheet.
*/
app.post('/observation', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);
        const observationData = req.body;
        console.log('Observation Create Request Body:', observationData);

        const response = await axios.post(`${EPIC_FHIR_URL}/Observation`, observationData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        });

        res.status(201).json({
            success: true,
            message: "Observation created successfully",
            data: response.data
        });
    } catch (error) {
        console.error("Error in /observation route:", error);
        res.status(500).json({
            success: false,
            message: "Error creating observation",
            error: error.response ? error.response.data : error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
