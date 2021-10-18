import express from 'express'

const router = express.Router()

app.get('/', async (req, res) => {
    const members = await collection.find({})
    console.log(members)
    return res.json(members)
  })

export default router