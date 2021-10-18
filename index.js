import express from 'express'
import dotenv from 'dotenv'
import { createClient } from "@astrajs/collections"

const app = express()

dotenv.config()

// enable json and url encoded data
app.use(express.json())
app.use(express.urlencoded({extended: false}))

// create an Astra DB client
const astraClient = await createClient({
  astraDatabaseId: process.env.ASTRA_DB_ID,
  astraDatabaseRegion: process.env.ASTRA_DB_REGION,
  applicationToken: process.env.ASTRA_DB_APPLICATION_TOKEN,
})

const collection = astraClient.namespace("stackr").collection("testcollection")

// index route
app.get('/', (req,res)=>{
  res.send("You're n the index page")
})

// get all documents
app.get('/blogs', async (req, res) => {
  const members = await collection.find({})
  console.log(members)
  return res.json(members)
})

// post route
app.post('/new', async(req, res) => {
  const {title, description, author} = req.body
  const newUser = await collection.create({
    title: title,
    description: description,
    author: author
  })

  console.log(req.body)
  return res.json({data: newUser, msg: 'user created successfully'})
})

// updating docs
app.put('/update', async(req, res)=>{
  const {title, description, author} = req.body
const updatedUser = await collection.update("1b4a845d-7460-4971-a8a7-0ef371771d85", {
  title: title,
    description: description,
    author: author
  })

  return res.json({data: updatedUser, msg: 'user updated successfully'})
})


app.delete('/delete', async(req,res)=>{
  const user = await collection.delete("1b4a845d-7460-4971-a8a7-0ef371771d85")

  if(!user){
    return res.json({msg: '404 user not found'})
  }

  return res.json({msg: 'user deleted successfuly'})
})



app.listen(process.env.APP_PORT, () => {
    console.log(`server running: port:: ${process.env.APP_PORT}`)
})