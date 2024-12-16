import express from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import fetch from "node-fetch";
import session from "express-session";
import axios from "axios";
import https from "https";
import { State, City } from "country-state-city";
import { getMaxListeners } from "events";
import unirest from "unirest";
import "dotenv/config.js";

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(session({
  secret: "dbcdhbius",
  resave: false,
  saveUninitialized: true
}));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true });

const MAIL_ID = process.env.MAIL_ID;
const MAIL_PASS_KEY = process.env.MAIL_PASS_KEY;
const FOURSQUARE_KEY = process.env.FOURSQUARE_KEY;

// DEFINING THE SCHEMA

const userSchema = new mongoose.Schema({
  name: String,
  email: String
});

const RegisteredHospital = new mongoose.Schema({
  hospitalName: String,
  hospitalAddress: String,
  password: String,
  patient: [{
    patientName: String,
    patientNum: String,
    patientAddress: String,
    patientStatus: String,
    ambuTrack: String
  }],
  driver: [{
    driverName: String,
    driverNum: String,
    driverId: String,
    driverPass: String,
    driverStatus: String,
    patientAssign: String
  }]
});

const hospitallist = mongoose.model("hospitallist", RegisteredHospital);

const user = mongoose.model("user", userSchema);

// GET REQUESTS 

app.get("/", (req, res) => {
  res.render("home");
});
app.get("/service", (req, res) => {
  res.render("service");
});
app.get("/features", (req, res) => {
  res.render("features");
});
app.get("/aboutUs", (req, res) => {
  res.render("aboutUs");
});
app.get("/contactUs", (req, res) => {
  res.render("contactUs");
});

app.get("/book", (req, res) => {
  res.render("bookNow");
});

// MAIL SENDING FEATURE 

app.post("/message", (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const msg = req.body.msg;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: MAIL_ID,
      pass: MAIL_PASS_KEY
    },
    port: 465,
    host: 'smtp.gmail.com'
  });

  const mailOption1 = {
    from: MAIL_ID,
    to: `${email}`,
    subject: "WellWheel customer care",
    text: "Thanks For Contacting Us " + `${name}` + "! We will get back to you very soon!"
  };

  const mailOption2 = {
    from: MAIL_ID,
    to: MAIL_ID,
    subject: `${name}`,
    text: "NAME: " + `${name}` + "\n EMAIL: " + `${email}` + "\n MESSAGE: " + `${msg}`
  }

  transporter.sendMail(mailOption1, (error, info) => {
    if (error) {
      console.log(error);
      res.send("Error Sending Email");
    }
    else {
      res.send("Email Sent Successfully!");
    }
  });

  transporter.sendMail(mailOption2, (error, info) => {
    if (error) {
      console.log(error);
      res.send("Error Sending Email");
    }
    else {
      res.send("Email Sent Successfully");
    }
  });

  user.findOne({ email: email }).then(function (elem) {
    if (!elem) {
      const newUser = new user({
        name: name,
        email: email
      });
      newUser.save();
    }
  }).catch((err) => {
    console.log(err);
  });

  res.render("message");

});

// BOOKING REQUEST 

app.post("/book", (req, res) => {
  var number = req.body.phone;
  var mail = req.body.mail;
  var username = req.body.Name;
  // GENERATING RANDOM 6 DIGIT OTP CODE
  var code = Math.floor(Math.random() * 999999);
  req.session.code = code;
  // SENDING OTP USING  NODEMAILER
  const sendOTP = async () => {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: MAIL_ID,
        pass: MAIL_PASS_KEY
      },
      port: 465,
      host: 'smtp.gmail.com'
    });

    const mailOTP = {
      from: MAIL_ID,
      to: `${mail}`,
      subject: "WellWheel OTP Service",
      text: `Your OTP is ${code}.`
    };
    try {
      await transporter.sendMail(mailOTP);
      console.log("Email sent successfully!");
      res.render("verify", { number: number, username: username, code: code, mail: mail });
    } catch (error) {
      console.log(error);
      res.send("Error Sending Email");
    }
  };

  sendOTP();
});

// OTP VERIFICATION 

app.post("/verify", (req, res) => {
  var userName = req.body.userName;
  var phoneNumber = req.body.phoneNumber;
  var enteredCode = req.body.code;
  var correctCode = req.session.code;
  var count = req.session.count || 0;
  if (enteredCode == correctCode) {
    var allState = (State.getStatesOfCountry("IN"));
    var allCities = {};
    for (var i = 0; i < allState.length; i++) {
      var city = City.getCitiesOfState("IN", allState[i].isoCode);
      allCities[allState[i].name] = city;
    }
    var allCitiesString = JSON.stringify(allCities);
    res.render("location", { allState: allState, allCitiesString: allCitiesString, userName: userName, phoneNumber: phoneNumber });
  }
  else {
    count++;
    if (count == 3) {
      res.redirect("/book");
    }
    else {
      res.render("verify", { Username: userName, number: phoneNumber });
    }
  }
});

// USER LOCATION SELECTOR

app.post("/location", async (req, res) => {
  try {
    var latitude;
    var longitude;
    var userName = req.body.userName;
    var phoneNumber = req.body.phoneNumber;
    var state = req.body.state;
    var city = req.body.city;
    var apiUrl = "https://nominatim.openstreetmap.org/search";
    var params = {
      q: city + ", " + state,
      format: "json",
      limit: 1
    };

    var queryString = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    }).join("&");

    var url = apiUrl + "?" + queryString;

    var response = await fetch(url);
    const data = await response.json();

    if (data.length > 0) {
      latitude = data[0].lat;
      longitude = data[0].lon;

    } else {
      console.log("Coordinates not found for the specified location.");
    }

    function hospitalCall() {
      const options = {
        method: 'GET',
        hostname: 'api.foursquare.com',
        port: null,
        path: '/v3/places/search?ll=' + latitude + '%2C' + longitude + '&radius=100000&categories=15000&limit=50',
        headers: {
          accept: 'application/json',
          Authorization: FOURSQUARE_KEY
        }
      };

      const apiRequest = https.request(options, function (apiResponse) {
        let responseBody = '';

        apiResponse.on('data', function (chunk) {
          responseBody += chunk;
        });

        apiResponse.on('end', function () {
          const data = JSON.parse(responseBody);
          const hospitals = data['results'];
          const filteredHospitals = hospitals.map(hospital => {
            return {
              name: hospital['name'],
              address: hospital['location']['formatted_address']
            };
          });
          res.render("hospital", { hospital: filteredHospitals, userName: userName, phoneNumber: phoneNumber });
        });
      });

      apiRequest.end();
    }
    hospitalCall();

  } catch (error) {
    console.log("An Error Occured: " + error);
  }

});

// HOSPITAL LISTING

app.post("/hospital", (req, res) => {
  var hospitalName = req.body.hospitalName;
  var hospitalAddress = req.body.hospitalAddress;
  var userName = req.body.userName;
  var phoneNumber = req.body.phoneNumber;
  hospitallist.findOneAndUpdate(
    { hospitalName: hospitalName, hospitalAddress: hospitalAddress },
    { $push: { patient: { patientName: userName, patientNum: phoneNumber, patientStatus: 'pending', ambuTrack: "Booking Confirmed" } } },
    { new: true }
  )
    .then((updatedHospital) => {
      if (!updatedHospital) {
        res.send("Hospital is not registered");
      } else {
        res.render("track", { userName: userName, phoneNumber: phoneNumber, hospitalName: hospitalName, hospitalAddress });
      }
    })
    .catch((error) => {
      console.log("Error updating pending case:", error);
      res.send("Error updating pending case");
    });
});

// INITIAL DRIVER DETAILS

var assigndriverName = "Not Assigned Yet";
var assigndriverNum = "Not Assigned Yet";
var assigndriverId = "Not Assigned Yet";

// TRACKING FEATURE 

app.post("/track", async (req, res) => {
  var userName = req.body.userName;
  var phoneNumber = req.body.phoneNumber;
  var hospitalName = req.body.hospitalName;
  var hospitalAddress = req.body.hospitalAddress;
  var ambuTrack;
  var patientId;

  try {
    const hospital = await hospitallist.findOne({ hospitalName: hospitalName, hospitalAddress: hospitalAddress });

    if (!hospital) {
      console.log("Hospital not found");
    } else {
      const patient = hospital.patient.find((p) => p.patientName === userName && p.patientNum === phoneNumber);

      if (!patient) {
        console.log("Patient not found");
      } else {
        ambuTrack = patient.ambuTrack;
        patientId = patient._id.toString();

        if (ambuTrack === "ambulance assigned") {
          const h1 = await hospitallist.findOne({ hospitalName: hospitalName, hospitalAddress: hospitalAddress });

          if (!h1) {
            console.log("Hospital is not found");
          } else {
            const driver = h1.driver.find((d) => d.patientAssign === patientId);

            if (!driver) {
              console.log("Driver not found");
            } else {
              assigndriverName = driver.driverName;
              assigndriverId = driver.driverId;
              assigndriverNum = driver.driverNum;
            }
          }
        }
      }
    }
    res.render("status", {
      userName: userName,
      phoneNumber: phoneNumber,
      hospitalName: hospitalName,
      hospitalAddress: hospitalAddress,
      ambuTrack: ambuTrack,
      driverName: assigndriverName,
      driverNum: assigndriverNum,
      driverId: assigndriverId
    });
  } catch (err) {
    res.send(err);
  }
});

// EXPRESS.JS SERVER

app.listen(3000, () => {
  console.log("You are at: http://localhost:3000");
})
