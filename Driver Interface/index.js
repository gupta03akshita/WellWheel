import express from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import axios from "axios";
import https from "https";
import { State, City } from "country-state-city";
import fetch from "node-fetch";
import { ObjectId } from "mongodb";
import "dotenv/config.js";

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));


mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true });
const MAIL_ID = process.env.MAIL_ID;
const MAIL_PASS_KEY = process.env.MAIL_PASS_KEY;
const FOURSQUARE_KEY = process.env.FOURSQUARE_KEY;

// DEFINING THE SCHEMAS

const driverUserSchema = new mongoose.Schema({
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

const driverUser = mongoose.model("driverUser", driverUserSchema);
const hospitallist = mongoose.model("hospitallist", RegisteredHospital);

// HOME PAGE REQUEST

app.get("/", (req, res) => {
    var allState = (State.getStatesOfCountry("IN"));
    var allCities = {};
    for (var i = 0; i < allState.length; i++) {
        var city = City.getCitiesOfState("IN", allState[i].isoCode);
        allCities[allState[i].name] = city;
    }
    var allCitiesString = JSON.stringify(allCities);
    res.render("driver-home", { allState: allState, allCitiesString: allCitiesString });
});

var latitude;
var longitude;
app.post("/", async (req, res) => {
    try {
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

        res.redirect("/hospital");

    } catch (error) {
        console.log("An error occured: " + error);
    }
});

// HOPSITAL LISTING 

app.get("/hospital", (req, res) => {

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
            res.render("hospital", { hospital: filteredHospitals });
        });
    });

    apiRequest.end();
});

app.post("/hospital", (req, res) => {
    var hospitalName = req.body.hospitalName;
    var hospitalAdd = req.body.hospitalAddress;
    res.render("login", { hospitalName: hospitalName, hospitalAddress: hospitalAdd });
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
        res.send("Email Sent Successfully");
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
  
    driverUser.findOne({ email: email }).then(function (elem) {
      if (!elem) {
        const newUser = new driverUser({
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

app.get("/message", (req, res) => {
    res.render("message");
});

// LOGIN AND SIGNUP PAGE RENDERING

app.post("/login", async (req, res) => {
    var hospitalName;
    var hospitalAddress;
    var driverName;
    var driverId;
    var password;
    function getvalue() {
        hospitalName = req.body.hospitalName;
        hospitalAddress = req.body.hospitalAddress;
        driverName = req.body.driverName;
        driverId = req.body.driverId;
        password = req.body.password;
    }
    await getvalue();
    hospitallist.findOne({ hospitalName: hospitalName, hospitalAddress: hospitalAddress }).then(function (hospital) {
        if (!hospital) {
            res.send("hospital not found");
        }
        else {
            const driver = hospital.driver.filter((driver) => driver.driverName === driverName && driver.driverId === driverId && driver.driverPass === password);
            if (driver.length == 0) {
                res.render("login", { hospitalName: hospitalName, hospitalAddress: hospitalAddress });
            }
            else {
                res.render("driverProfile", { hospitalName: hospitalName, driverId: driverId, hospitalAddress: hospitalAddress });
            }
        }
    }).catch((err) => {
        console.log(err);
    })
});

app.post("/driverProfile", (req, res) => {
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    var driverId = req.body.driverId;
    res.render("driverProfile", { hospitalName: hospitalName, driverId: driverId, hospitalAddress: hospitalAddress });
});

app.post("/signup", (req, res) => {
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    res.render("signup", { hospitalName: hospitalName, hospitalAddress: hospitalAddress });
});

app.post("/register", (req, res) => {
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    var driverName = req.body.driverName;
    var driverId = req.body.driverId;
    var password = req.body.password;
    var driverNum = req.body.driverNum;
    hospitallist.findOne({ hospitalName: hospitalName, hospitalAddress: hospitalAddress }).then(function (hospital) {
        if (!hospital) {
            res.send("Hospital Not Found");
        }
        else {
            const driver = hospital.driver.filter((driver) => driver.driverId === driverId);
            if (driver.length != 0) {
                res.render("signup", { hospitalName: hospitalName, hospitalAddress: hospitalAddress });
            }
            else {
                hospitallist.findOneAndUpdate(
                    { hospitalName: hospitalName, hospitalAddress: hospitalAddress },
                    { $push: { driver: { driverName: driverName, driverNum: driverNum, driverId: driverId, driverPass: password, driverStatus: 'sleep' } } },
                    { new: true }
                ).then((updatedDriver) => {
                    if (!updatedDriver) {
                        res.send("Hospital is not registered");
                    } else {
                        console.log("Driver updated successfully");
                        res.render("driverProfile", { hospitalName: hospitalName, driverId: driverId, hospitalAddress: hospitalAddress });
                    }
                })
                .catch((error) => {
                    console.log("Error updating pending case:", error);
                    res.render("signup", { hospitalName: hospitalName, hospitalAddress: hospitalAddress });
                });
            }
        }

    }).catch((err) => {
        console.log(err);
    });

});

app.post("/status", (req, res) => {
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    var driverId = req.body.driverId;
    var status = req.body.status;

    hospitallist
        .findOneAndUpdate(
            {
                hospitalName: hospitalName,
                hospitalAddress: hospitalAddress,
                "driver.driverId": driverId
            },
            {
                $set: { "driver.$.driverStatus": status }
            },
            { new: true }
        )
        .then((updatedHospital) => {
            if (!updatedHospital) {
                res.send("Hospital not found");
            } else {
                res.render("currentStatus", { hospitalName: hospitalName, hospitalAddress: hospitalAddress, driverId: driverId, driverStatus: status });
            }
        })
        .catch((err) => {
            console.error(err);
            res.send(err);
        });
});

app.post("/currentStatus", async (req, res) => {
    var driverId = req.body.driverId;
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    var status;
    hospitallist.findOne({
        hospitalName: hospitalName,
        hospitalAddress: hospitalAddress,
    }).then((hospital) => {
        if (!hospital) {
            res.send("Hospital Not Found");
        }
        else {
            const driver = hospital.driver.filter((driver) => driver.driverId === driverId);
            if (driver.length == 0) {
                res.send("driver not found");
            }
            else {
                status = driver[0].driverStatus;
                if (status != 'working') {
                    res.render("currentStatus", { hospitalName: hospitalName, hospitalAddress: hospitalAddress, driverId: driverId, driverStatus: status });
                }
                else {
                    var patientName;
                    var patientAddress;
                    var patientPhoneNum;
                    hospitallist.findOne({ hospitalName: hospitalName, hospitalAddress: hospitalAddress }).then((hospital) => {
                        if (!hospital) {
                            res.send("hospital not found");
                        }
                        else {
                            const driver = hospital.driver.find((driver) => driver.driverId === driverId);
                            if (!driver) {
                                res.send('Driver not found');
                            }

                            var patientId = driver.patientAssign;
                            console.log(hospital.patient[0]._id);
                            const patient = hospital.patient.find((patient) => patient._id.equals(new ObjectId(patientId)));

                            if (!patient) {
                                res.send("patient not found");
                            }
                            patientName = patient.patientName;
                            patientAddress = patient.patientAddress;
                            patientPhoneNum = patient.patientNum;
                            res.render("workingStatus", { hospitalName: hospitalName, hospitalAddress: hospitalAddress, patientName: patientName, patientAddress: patientAddress, patientNum: patientPhoneNum, driverId: driverId, patientId: patientId });
                        }
                    }).catch((err) => {
                        res.send(err);
                    })

                }
            }
        }
    }).catch((err) => {
        res.send(err);
    });

});

app.post("/workingStatus", async (req, res) => {
    var driverId = req.body.driverId;
    var hospitalName = req.body.hospitalName;
    var hospitalAddress = req.body.hospitalAddress;
    var patientId = req.body.patientId;


    await hospitallist.findOneAndUpdate({ hospitalName: hospitalName, hospitalAddress: hospitalAddress, "driver.driverId": driverId }, { $set: { "driver.$.driverStatus": "active", "driver.$.patientAssign": "" } });

    hospitallist.findOneAndUpdate({ hospitalName: hospitalName, hospitalAddress: hospitalAddress, "patient._id": patientId }, { $set: { "patient.$.patientStatus": "complete", "patient.$.ambuTrack": "reached" } }).then(() => {
        res.render("currentStatus", { hospitalName: hospitalName, hospitalAddress: hospitalAddress, driverId: driverId, driverStatus: "active" });
    }).catch((err) => {
        res.send(err);
    })

});

// EXPRESS.JS SERVER

app.listen(3002, () => {
    console.log("You are at: http://localhost:3002")
});