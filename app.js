const express = require("express");
const faceapi = require("face-api.js");
const mongoose = require("mongoose");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
faceapi.env.monkeyPatch({ Canvas, Image });

const app = express();

app.use(cors());
app.use(fileUpload());

async function LoadModels() {
  // Load the models
  // __dirname gives the root directory of the server
  await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/models");
  await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/models");
}
LoadModels();

const faceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    unique: true,
  },
  descriptions: {
    type: Array,
    required: true,
  },
});

const FaceModel = mongoose.model("Face", faceSchema);

// async function uploadLabeledImages(images, label) {
//   try {
//     let counter = 0;
//     const descriptions = [];
//     // Loop through the images
//     for (let i = 0; i < images.length; i++) {
//       const img = await canvas.loadImage(images[i]);
//       counter = (i / images.length) * 100;
//       console.log(`Progress = ${counter}%`);
//       // Read each face and save the face descriptions in the descriptions array
//       const detections = await faceapi
//         .detectSingleFace(img)
//         .withFaceLandmarks()
//         .withFaceDescriptor();
//       descriptions.push(detections.descriptor);
//     }

//     // Create a new face document with the given label and save it in DB
//     const createFace = new FaceModel({
//       label: label,
//       descriptions: descriptions,
//     });
//     await createFace.save();
//     return true;
//   } catch (error) {
//     console.log(error);
//     return error;
//   }
// }

async function uploadLabeledImages(images, label) {
  try {
    const descriptions = [];
    for (let i = 0; i < images.length; i++) {
      const imagePath = images[i];
      // console.log(`Loading image from path: ${imagePath}`);
      const img = await canvas.loadImage(imagePath);
      // console.log(`Image loaded successfully from path: ${imagePath}`);

      const detections = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detections) {
        descriptions.push(detections.descriptor);
      } else {
        console.log(`No face detected in image at path: ${imagePath}`);
      }
    }

    const createFace = new FaceModel({
      label: label,
      descriptions: descriptions,
    });
    await createFace.save();
    return true;
  } catch (error) {
    console.error(`Error in uploadLabeledImages: ${error}`);
    return false;
  }
}

// async function getDescriptorsFromDB(image) {
//   // Get all the face data from mongodb and loop through each of them to read the data
//   let faces = await FaceModel.find();
//   for (i = 0; i < faces.length; i++) {
//     // Change the face data descriptors from Objects to Float32Array type
//     for (j = 0; j < faces[i].descriptions.length; j++) {
//       faces[i].descriptions[j] = new Float32Array(
//         Object.values(faces[i].descriptions[j])
//       );
//     }
//     // Turn the DB face docs to
//     faces[i] = new faceapi.LabeledFaceDescriptors(
//       faces[i].label,
//       faces[i].descriptions
//     );
//   }

//   // Load face matcher to find the matching face
//   const faceMatcher = new faceapi.FaceMatcher(faces, 0.6);

//   // Read the image using canvas or other method
//   const img = await canvas.loadImage(image);
//   let temp = faceapi.createCanvasFromMedia(img);
//   // Process the image for the model
//   const displaySize = { width: img.width, height: img.height };
//   faceapi.matchDimensions(temp, displaySize);

//   // Find matching faces
//   const detections = await faceapi
//     .detectAllFaces(img)
//     .withFaceLandmarks()
//     .withFaceDescriptors();
//   const resizedDetections = faceapi.resizeResults(detections, displaySize);
//   // const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
//   const results = resizedDetections.map((d) => {
//     const match = faceMatcher.findBestMatch(d.descriptor);
//     if (match.distance < 0.5) {
//       // Adjust threshold based on your requirements
//       return match;
//     } else {
//       return { label: "no_face_found" };
//     }
//   });
//   return results;
// }

async function getDescriptorsFromDB(image) {
  // Get all the face data from mongodb and loop through each of them to read the data
  let faces = await FaceModel.find();
  for (i = 0; i < faces.length; i++) {
    // Change the face data descriptors from Objects to Float32Array type
    for (j = 0; j < faces[i].descriptions.length; j++) {
      faces[i].descriptions[j] = new Float32Array(
        Object.values(faces[i].descriptions[j])
      );
    }
    // Turn the DB face docs to
    faces[i] = new faceapi.LabeledFaceDescriptors(
      faces[i].label,
      faces[i].descriptions
    );
  }

  // Load face matcher to find the matching face
  const faceMatcher = new faceapi.FaceMatcher(faces, 0.6);

  // Read the image using canvas or other method
  const img = await canvas.loadImage(image);
  let temp = faceapi.createCanvasFromMedia(img);
  // Process the image for the model
  const displaySize = { width: img.width, height: img.height };
  faceapi.matchDimensions(temp, displaySize);

  // Find matching faces
  const detections = await faceapi
    .detectAllFaces(img)
    .withFaceLandmarks()
    .withFaceDescriptors();
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  // const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
  const results = resizedDetections.map((d) => {
    const match = faceMatcher.findBestMatch(d.descriptor);
    if (match.distance < 0.5) {
      // Adjust threshold based on your requirements
      return match;
    } else {
      return { _label: '{"no_face_found"}' };
    }
  });
  return results;
}

app.post("/post-face", async (req, res) => {
  if (!req.files || !req.files.File1 || !req.body.label) {
    return res
      .status(400)
      .send("Invalid request. Please upload an image and provide a label.");
  }

  const File1 = req.files.File1;
  const tempFilePath = path.join(__dirname, "tmp", File1.name);
  await File1.mv(tempFilePath);

  const label = req.body.label;
  const result = await uploadLabeledImages([tempFilePath], label);

  fs.unlinkSync(tempFilePath); // Remove the temporary file after processing

  if (result) {
    res.json({ message: "Face data stored successfully" });
  } else {
    res.json({ message: "Something went wrong, please try again." });
  }
});


app.post("/check-face", async (req, res) => {
  if (!req.files) {
    return res.status(400).send("No files were uploaded.");
  }
  const File1 = req.files.File1;
  try {
    const results = await getDescriptorsFromDB(File1.data);

    const matchFound = results.some(
      (result) => result.label !== "no_face_found"
    );
    if (matchFound) {
      res.json({ message: "Match found", data: results[0].label });
    } else {
      res.json({ message: "Not found.", data: false });
    }
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).send("Internal Server Error");
  }
});

mongoose
  .connect(
    `mongodb+srv://aneesh:aneesh@cluster0.4ddziji.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0`,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    }
  )
  .then(() => {
    app.listen(process.env.PORT || 5000);
    console.log("DB connected and server us running.");
  })
  .catch((err) => {
    console.log(err);
  });
