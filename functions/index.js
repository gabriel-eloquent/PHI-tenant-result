const admin = require("firebase-admin");
const functions = require("firebase-functions");
admin.initializeApp();
const db = admin.firestore();

exports.addPHI = functions.https.onRequest(async (request, response) => {
  const data = request.body;
  functions.logger.info("Add PHI - data => ", data);
  await db.doc(`PHI/${data.email}`).set(data);
  response.send("OK");
});

exports.districtEmailMapping = functions.https.onRequest(
  async (request, response) => {
    /**
     * data = {district: 'DISTRICT_ID', emails:[]}
     */
    const data = request.body;
    functions.logger.info("Add DistrictEmailMapping - data => ", data);
    await db.doc(`districtPHIMapping/${data.district}`).set(data);
    response.send("OK");
  }
);

exports.barcodeEmailMapping = functions.https.onRequest(
  async (request, response) => {
    /**
     * data = {barcode: '', email:'', district: 'DISTRICT_ID'}
     */
    const data = request.body;
    functions.logger.info("Add barcode - data => ", data);
    await db.doc(`BarcodePHIMapping/${data.barcode}`).set(data);
    response.send("OK");
  }
);

exports.resultsAdd = functions.https.onRequest(async (request, response) => {
  /**
   * data = {barcode: '', result:''}
   */
  const data = request.body;
  functions.logger.info("Add result - data => ", data);
  await db.collection(`results`).add(data);
  response.send("OK");
});

exports.getResults = functions.https.onRequest(async (request, response) => {
  /**
   * check QS district_id and get results for those emails which belong to the district
   */
  const district = request.query.district;
  functions.logger.info("Get result - district => ", district);
  const districtResultsSnapshot = await db
    .collection(`districtResults/${district}/results/`)
    .get();
  const resData = [];
  districtResultsSnapshot.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
    resData.push(doc.data());
  });
  response.send(resData);
});

exports.createUser = functions.firestore
  .document("results/{resultId}")
  .onCreate(async (snap, context) => {
    // this is Materialized Views pattern - much more reads that writes thus the reason for it
    // compile various data into one for the given district - fast and cheap reads

    // get the just created data
    const resultData = snap.data();
    const barcode = resultData.barcode;
    // find the PHI ID (email)
    const barcodePHIDocRef = await db.doc(`BarcodePHIMapping/${barcode}`).get();
    if (barcodePHIDocRef.exists) {
      bcPHIMappingData = barcodePHIDocRef.data();
      const email = bcPHIMappingData.email;
      const district = bcPHIMappingData.district;
      // find the PHI data
      const PHIDocRef = await db.doc(`PHI/${email}`).get();
      if (PHIDocRef.exists) {
        // add the result and the PHI into the district's doc
        const PHIData = PHIDocRef.data();
        return await db
          .doc(`districtResults/${district}/results/${email}`)
          .set({ ...PHIData, ...resultData });
      }
    }
    // Log that some data is missing?
    return await db
      .doc("problems")
      .add({ ...resultData, text: "Missing some data" });
  });

/**
 * Whenever new compiled result and PHI is being created send the notification to the email
 */
exports.onResultCreated = functions.firestore
  .document("districtResults/{districtId}/results/{email}")
  .onCreate(async (snap, context) => {
    const resultPHIData = snap.data();

    console.log(
      `Send notification to ${email} with result ${resultPHIData.result}`
    );
  });

/**
 * Whenever new email added check if there are results and send
 * (This is raw code - will trigger once for disstrict now - but the idea is this)
 */
exports.onResultCreated = functions.firestore
  .document("BarcodePHIMapping/{barcode}")
  .onCreate(async (snap, context) => {
    const { email } = snap.data();
    const { district } = await db
      .doc("districtPHIMapping")
      .where("email", "array-contains", email)
      .get()
      .data();
    const resultPHIData = await db
      .doc(`districtResults/${district}/results/${email}`)
      .get()
      .data();

    console.log(
      `Send notification to ${email} with result ${resultPHIData.result}`
    );
  });
