import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'schema.sql');

const DB_NAME = process.env.DB_NAME || 'crypto_ai';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');

async function initDb() {
  const adminClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
    if (res.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`Database "${DB_NAME}" created successfully`);
    } else {
      console.log(`Database "${DB_NAME}" already exists`);
    }
    await adminClient.end();
  } catch (err) {
    console.error('Failed to create database:', err.message);
    process.exit(1);
  }

  const dbClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    await dbClient.connect();
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await dbClient.query(schema);
    console.log('Schema applied successfully');
    await dbClient.end();
  } catch (err) {
    console.error('Failed to apply schema:', err.message);
    process.exit(1);
  }

  console.log('Database initialization complete');
}

initDb();
