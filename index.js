const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;
const crypto = require("crypto");

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

function generateTrackingId() {
  const prefix = "BOOKING"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}

// MidleWire
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  // console.log('in', req.headers.authorization)
  const token = req.headers.authorization;
  //   // console.log(token)

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("jjj", decoded);
    req.decoded_email = decoded.email;

    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ahmyuia.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("style_decor_db");
    const userCollection = db.collection("users");
    const servicesCollection = db.collection("services");
    const bookingsCollection = db.collection("bookings");
    const paymentCollection = db.collection("payments");
    const decoratorCollection = db.collection("decorators");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user related api
    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        query.displayName = { $regex: searchText, $options: "i" };
      }
      const cursor = userCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExist = await userCollection.findOne({ email });
      if (userExist) {
        return res.send({ message: "user exist" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      },
    );

    // Service Api
    // app.get("/services", async (req, res) => {
    //   const query = {};
    //   const cursor = servicesCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.get("/services", async (req, res) => {
      const search = req.query.search;
      const query = {};
      if (search) {
        //       $or: [
        //   { service_name: { $regex: search, $options: "i" } },
        //   { category: { $regex: search, $options: "i" } }
        // ]
        query.service_name = { $regex: search, $options: "i" };
      }
      const cursor = servicesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.post("/services", verifyFBToken, verifyAdmin, async (req, res) => {
      const service = req.body;
      const result = await servicesCollection.insertOne(service);
      res.send(result);
    });

    // Bookings API

    app.get("/bookings", verifyFBToken, async (req, res) => {
      const query = {};
      const { email, deliveryStatus } = req.query;
      if (email) {
        query.userEmail = email;
      }
      if (deliveryStatus) {
        query.deliveryStatus = deliveryStatus;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = bookingsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/bookings/decorator", async (req, res) => {
      const { decoratorEmail, deliveryStatus } = req.query;
      const query = {};
      if (decoratorEmail) {
        query.decoratorEmail = decoratorEmail;
      }
      if (deliveryStatus !== "taskCompleted") {
        // query.deliveryStatus = {$in:['decorator-assigned','on_the_way_to_venue']}
        query.deliveryStatus = { $nin: ["taskCompleted"] };
      } else {
        query.deliveryStatus = deliveryStatus;
      }
      const cursor = bookingsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/bookings/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.post("/bookings", verifyFBToken, async (req, res) => {
      const bookings = req.body;
      bookings.createdAt = new Date();

      const result = await bookingsCollection.insertOne(bookings);
      res.send(result);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const { bookingId, decoratorId, decoratorName, decoratorEmail } =
        req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          deliveryStatus: "decorator-assigned",
          decoratorId: decoratorId,
          decoratorName: decoratorName,
          decoratorEmail: decoratorEmail,
        },
      };
      const result = await bookingsCollection.updateOne(query, updatedDoc);

      const decoratorQuery = { _id: new ObjectId(decoratorId) };
      const decoratorUpdatedDoc = {
        $set: {
          workStatus: "in_transit",
        },
      };
      const decoratorResult = await decoratorCollection.updateOne(
        decoratorQuery,
        decoratorUpdatedDoc,
      );
      res.send(decoratorResult);
    });

    app.patch("/bookings/:id/status", async (req, res) => {
      const { deliveryStatus, decoratorId } = req.body;
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          deliveryStatus: deliveryStatus,
        },
      };
      if (deliveryStatus === "taskCompleted") {
        const decoratorQuery = { _id: new ObjectId(decoratorId) };
        const decoratorUpdatedDoc = {
          $set: {
            workStatus: "available",
          },
        };
        const decoratorResult = await decoratorCollection.updateOne(
          decoratorQuery,
          decoratorUpdatedDoc,
        );
      }
      const result = await bookingsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.serviceName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        metadata: {
          bookingId: paymentInfo.bookingId,
          name: paymentInfo.serviceName,
        },
        mode: "payment",
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
      });

      // console.log(session)
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log(sessionId)
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "already Exist",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      // console.log(session);
      const trackingId = generateTrackingId();

      if (session.payment_status === "paid") {
        const id = session.metadata.bookingId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus: "pending-pickup",
            trackingId: trackingId,
          },
        };
        const result = await bookingsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId: session.metadata.bookingId,
          bookingName: session.metadata.name,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          return res.send({
            success: true,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            modifyBooking: result,
            paymentInfo: resultPayment,
          });
        }
      }

      return res.send({ success: false });
    });

    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // decorator api
    app.get("/decorators", async (req, res) => {
      const { status, workStatus } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (workStatus) {
        query.workStatus = workStatus;
      }
      const cursor = decoratorCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/decorators", async (req, res) => {
      const decorator = req.body;
      decorator.createdAt = new Date();
      decorator.status = "pending";

      const email = decorator.email;

      const decoratorExist = await decoratorCollection.findOne({ email });
      if (decoratorExist) {
        return res.send({ message: "decorator exist" });
      }

      const result = await decoratorCollection.insertOne(decorator);
      res.send(result);
    });

    app.patch(
      "/decorators/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.body.status;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status,
            workStatus: "available",
          },
        };
        const result = await decoratorCollection.updateOne(query, updatedDoc);

        if (status === "approve") {
          const email = req.body.email;
          const userQuery = { email };
          const updateUser = {
            $set: {
              role: "decorator",
            },
          };
          const userResult = await userCollection.updateOne(
            userQuery,
            updateUser,
          );
        }
        res.send(result);
      },
    );

    app.get("/service-stats", async (req, res) => {
      const result = await bookingsCollection
        .aggregate([
          {
            $group: {
              _id: "$serviceName",
              totalBookings: { $sum: 1 },
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("DECORE IS SIHFTING");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
