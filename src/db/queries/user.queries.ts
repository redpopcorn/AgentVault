
import { pool } from '@config/db'

export interface User {
  id: number
  username: string
  email: string
  password_hash: string
  created_at: Date
}

export const findUserById = async (id: number): Promise<User | null> => {
  const result = await pool.query<User>('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0] || null
}

export const finduserbyemail = async(email: string):Promise<User|null> =>{
    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email])
    return result.rows[0] || null
}

    
export const createUser = async (username: string, email: string, password_hash: string): Promise<User> => {
  const result = await pool.query<User>(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',