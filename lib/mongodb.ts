import { MongoClient, Db, Collection } from "mongodb";

// Lazy connection — only connects when getCollection() is called,
// NOT at import time. This prevents build-time errors on Vercel
// where env vars aren't available during static page generation.

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (process.env.NODE_ENV === "development") {
    // Cache in dev to survive hot reloads
    if (!globalWithMongo._mongoClientPromise) {
      globalWithMongo._mongoClientPromise = new MongoClient(uri).connect();
    }
    return globalWithMongo._mongoClientPromise;
  }

  // Production: new connection per cold start
  return new MongoClient(uri).connect();
}

export async function getDb(dbName = "media-vault"): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export async function getCollection(collectionName = "library"): Promise<Collection> {
  const db = await getDb();
  return db.collection(collectionName);
}