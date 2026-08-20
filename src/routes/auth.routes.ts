import { Router } from 'express'
import { signup, login } from '@controllers/auth.controller'

export const authRouter = Router()

authRouter.post('/signup', signup)
authRouter.post('/login', login)
