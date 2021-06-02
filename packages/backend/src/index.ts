import express, {NextFunction, Request, Response} from "express";
import path from "path";
import {errorHandler}from "./errors";
import morgan from 'morgan'
import {apiV1Router} from "./apiV1";

const app = express();
app.use(express.json())

// Logging
app.use(morgan('dev'))

// api router
app.use('/api/v1', apiV1Router)

// frontend
app.use(express.static(path.join(__dirname, '../../frontend/build')))

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'))
})

// errors
app.use(async (error: Error, req: Request, res: Response, next: NextFunction) => {
    await errorHandler(error, res)
})

const port = process.env.PORT || 8080
app.listen(port, () => {
    console.log(`   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:8080\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`)
})
