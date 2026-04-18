const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;
const crypto = require("crypto");

// const  admin = require("firebase-admin");

// const  serviceAccount = require("./style-decor-9072c-firebase-adminsdk-fbsvc-1939e85d94.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });



function generateTrackingId() {
    const prefix = "BOOKING"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}


// MidleWire
app.use(express.json());
app.use(cors());

// const verifyFBToken = async (req,res,next) =>{
//   // console.log('in', req.headers.authorization)
//   const token = req.headers.authorization
//   // console.log(token)

//   if(!token){
//    return  res.status(401).send({message:'unauthorized access'})
//   }

//   try{
//     const idToken = token.split(" ")[1]
//     const decoded = await admin.auth().verifyIdToken(idToken)
//     console.log('jjj',decoded)

//       next()



//   }
//   catch(err){

//   }


// }

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
    await client.connect();

    const db = client.db("style_decor_db");
    const userCollection = db.collection("users");
    const servicesCollection = db.collection("services");
    const bookingsCollection = db.collection("bookings");
    const paymentCollection = db.collection('payments');
    const decoratorCollection = db.collection('decorators')


    // user related api

   app.post('/users', async(req,res)=>{
    const user = req.body
    user.role = 'user'
    user.createdAt = new Date()
    const email = user.email
    const userExist = await userCollection.findOne({email})
    if(userExist){
      return res.send({message:'user exist'})
    }

    const result = await userCollection.insertOne(user)
    res.send(result)
   })

    // Service Api
    app.get("/services", async (req, res) => {
      const query = {};
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

    app.post("/services", async (req, res) => {
      const service = req.body;
      const result = await servicesCollection.insertOne(service);
      res.send(result);
    });

    // Bookings API

    app.get("/bookings", async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) {
        query.userEmail = email;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = bookingsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const bookings = req.body;
      bookings.createdAt = new Date();

      const result = await bookingsCollection.insertOne(bookings);
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

    app.patch("/payment-success",  async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log(sessionId)
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent
      const query = {transactionId : transactionId}
      const paymentExist = await paymentCollection.findOne(query)
      if(paymentExist){
        return res.send({message: 'already Exist', transactionId,
          trackingId:paymentExist.trackingId
        })
      }


      // console.log(session);
      const trackingId = generateTrackingId()

      if (session.payment_status === "paid") {
        const id = session.metadata.bookingId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            trackingId: trackingId
          },
        };
        const result = await bookingsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId: session.metadata.bookingId,
          bookingName:session.metadata.name,
          transactionId : session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt : new Date(),
          trackingId:trackingId

        };

        if(session.payment_status === 'paid'){
          const resultPayment = await paymentCollection.insertOne(payment)
         return res.send({success:true, trackingId:trackingId,          transactionId : session.payment_intent,
           modifyBooking: result,
           paymentInfo:resultPayment})
        }

      }

     return res.send({ success: false });
    });

    app.get('/payments', async (req,res)=>{
      const email = req.query.email
      const query ={}
      if(email){
        query.customerEmail = email 
      }
      const cursor = paymentCollection.find(query).sort({paidAt: -1})
      const result = await cursor.toArray()
      res.send(result)
    })

    // decorator api

    

    app.post('/decorators', async (req,res)=>{
      const decorator = req.body
      decorator.createdAt = new Date()
      decorator.status = 'pending'
      const result = await decoratorCollection.insertOne(decorator)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
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
