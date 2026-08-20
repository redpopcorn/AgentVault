
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

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email])
  return result.rows[0] || null
}

    
export const createUser = async (
  username: string,
  email: string,
  passwordHash: string,
  tenantName: string
):  Promise<{ user: User; tenantId: number }> => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const tenantResult = await client.query<{ id: number }>(
      'INSERT INTO tenants (companyname, slug) VALUES ($1, $2) RETURNING id',
      [tenantName, tenantName.toLowerCase().replace(/\s+/g, '-')]
    )
    const tenantRow = tenantResult.rows[0]
    if (!tenantRow) {
      throw new Error('Failed to create tenant')
    }
    const tenantId = tenantRow.id

    const userResult = await client.query<User>(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, passwordHash]
    )
    const user = userResult.rows[0]
    if (!user) {
      throw new Error('Failed to create user')
    }

    await client.query(
      'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [tenantId, user.id, 'admin']
    )

    await client.query('COMMIT')
    return { user, tenantId }

  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export const findTenantMember = async (
  userId: number
): Promise<{ tenant_id: number; role: 'admin' | 'member' | 'viewer' } | null> => {
  const result = await pool.query<{ tenant_id: number; role: 'admin' | 'member' | 'viewer' }>(
    'SELECT tenant_id, role FROM tenant_members WHERE user_id = $1 LIMIT 1',
    [userId]
  )
  return result.rows[0] ?? null
}