const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');



const port = process.env.PORT || 3000


// MidleWire
app.use(express.json())
app.use(cors())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ahmyuia.mongodb.net/?appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('style_decor_db')
    const servicesCollection = db.collection('services')

    // Service Api
    app.get('/services',async(req,res)=>{
      const query = {}
      const cursor = servicesCollection.find(query)
      const result =await cursor.toArray()
      res.send(result) 

    })

    app.post('/services', async(req,res)=>{
      const service = req.body
      const result = await servicesCollection.insertOne(service)
      res.send(result)


    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('DECORE IS SIHFTING')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
