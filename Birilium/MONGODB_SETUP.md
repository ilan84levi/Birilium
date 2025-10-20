# MongoDB Setup Guide for Birilium Blockchain

## Overview

Birilium now supports MongoDB for persistent blockchain storage. Without MongoDB, the blockchain runs in memory-only mode and all data is lost when the node restarts.

## Quick Start (Local MongoDB)

### Option 1: Install MongoDB Locally

1. **Download MongoDB Community Server**:
   - Visit: https://www.mongodb.com/try/download/community
   - Download for your OS (Windows/Mac/Linux)
   - Install with default settings

2. **Start MongoDB**:
   ```bash
   # Windows (as service - starts automatically)
   # Or manually: "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"

   # Mac
   brew services start mongodb-community

   # Linux
   sudo systemctl start mongod
   ```

3. **Start Birilium Node**:
   ```bash
   cd birilium-coin
   node node.js
   ```

   You should see:
   ```
   Connecting to MongoDB...
   ✓ Connected to MongoDB: birilium
   ✓ Database indexes created
   ```

### Option 2: Use Docker

```bash
# Start MongoDB in Docker
docker run -d -p 27017:27017 --name birilium-mongo mongo:latest

# Start Birilium Node
cd birilium-coin
node node.js
```

## Cloud MongoDB (MongoDB Atlas)

### Free Tier Setup

1. **Create Account**:
   - Visit: https://www.mongodb.com/cloud/atlas
   - Sign up for free (512MB storage, perfect for testing)

2. **Create Cluster**:
   - Click "Build a Database"
   - Choose "Free" tier (M0)
   - Select region closest to you
   - Click "Create"

3. **Configure Access**:
   - **Network Access**: Add your IP address (or 0.0.0.0/0 for testing)
   - **Database Access**: Create a user with password

4. **Get Connection String**:
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password

5. **Configure Birilium**:
   ```bash
   # Create .env file
   cp .env.example .env

   # Edit .env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
   MONGODB_DB=birilium
   ```

6. **Start Node**:
   ```bash
   node node.js
   ```

## Configuration

### Environment Variables

Create a `.env` file in `birilium-coin/` directory:

```env
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=birilium

# Or MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DB=birilium
```

### Custom Connection

Edit `database.js` if you need custom connection options:

```javascript
this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017';
this.dbName = process.env.MONGODB_DB || 'birilium';
```

## Database Structure

### Collections

1. **blocks**:
   - Stores all blockchain blocks
   - Indexed by: `index`, `hash`

2. **transactions**:
   - Stores all transactions for fast querying
   - Indexed by: `fromAddress`, `toAddress`, `timestamp`

3. **state**:
   - Stores blockchain state (currentSupply, difficulty)

### Example Documents

**Block**:
```json
{
  "index": 1,
  "timestamp": 1234567890,
  "transactions": [...],
  "previousHash": "000abc...",
  "hash": "000def...",
  "nonce": 12345,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Transaction**:
```json
{
  "fromAddress": "04abc...",
  "toAddress": "04def...",
  "amount": 10,
  "fee": 0.01,
  "timestamp": 1234567890,
  "signature": "3045...",
  "blockHash": "000def...",
  "blockIndex": 1,
  "blockTimestamp": 1234567890
}
```

**State**:
```json
{
  "type": "blockchain",
  "currentSupply": 100,
  "difficulty": 4,
  "lastUpdated": "2024-01-01T00:00:00Z"
}
```

## API Endpoints

### Check Database Status

```bash
GET http://localhost:3001/api/database/status
```

**Response (Connected)**:
```json
{
  "connected": true,
  "mode": "persistent",
  "database": "birilium",
  "blocks": 100,
  "transactions": 250,
  "currentSupply": 1000,
  "difficulty": 4
}
```

**Response (Not Connected)**:
```json
{
  "connected": false,
  "mode": "memory-only",
  "message": "No database connection - blockchain is stored in memory only"
}
```

## Troubleshooting

### MongoDB Connection Failed

**Symptom**:
```
MongoDB connection failed: connect ECONNREFUSED 127.0.0.1:27017
Continuing without database persistence (memory-only mode)
```

**Solutions**:

1. **Check if MongoDB is running**:
   ```bash
   # Windows
   sc query MongoDB

   # Mac
   brew services list

   # Linux
   sudo systemctl status mongod
   ```

2. **Start MongoDB**:
   ```bash
   # Windows (as admin)
   net start MongoDB

   # Mac
   brew services start mongodb-community

   # Linux
   sudo systemctl start mongod
   ```

3. **Check port 27017**:
   ```bash
   netstat -an | grep 27017
   ```

### Connection String Issues

**Error**: `MongoServerError: bad auth`

**Solution**: Check username and password in connection string

**Error**: `MongoNetworkError: connect ETIMEDOUT`

**Solution**: Check network access settings (MongoDB Atlas firewall)

### Memory-Only Mode

If MongoDB connection fails, the node automatically falls back to memory-only mode:
- Node works normally
- All data is lost on restart
- No persistence between sessions

This is fine for:
- Development
- Testing
- Quick experiments

## Performance Tips

### Indexes

The database automatically creates indexes on:
- `blocks.index` (unique)
- `blocks.hash`
- `transactions.fromAddress`
- `transactions.toAddress`
- `transactions.timestamp`

### Backup

**Local MongoDB**:
```bash
mongodump --db birilium --out ./backup
```

**Restore**:
```bash
mongorestore --db birilium ./backup/birilium
```

**MongoDB Atlas**:
- Use built-in backup feature (free tier: manual exports)
- Paid tier: automatic point-in-time backups

## Production Recommendations

1. **Use MongoDB Atlas** (or managed MongoDB service)
2. **Enable authentication** (MongoDB security)
3. **Use replica sets** (high availability)
4. **Regular backups** (automated)
5. **Monitor performance** (Atlas has built-in monitoring)
6. **Set up alerts** (disk space, connections, etc.)

## Migration from Memory-Only

If you've been running in memory-only mode and want to add MongoDB:

1. **Install MongoDB** (see above)
2. **Restart node** - blockchain will start fresh in database
3. **Old in-memory data is lost** (this is expected)
4. **Mine some blocks** - they'll be saved to MongoDB
5. **Restart node again** - blocks should load from database

## Costs

**Local MongoDB**: Free
- Runs on your machine
- Storage limited by your disk space

**MongoDB Atlas Free Tier**: Free
- 512MB storage
- Good for ~10,000 blocks
- Shared cluster (slower)

**MongoDB Atlas Paid**: Starting at $9/month
- More storage
- Dedicated cluster (faster)
- Automatic backups
- Better performance

## Support

MongoDB Documentation: https://docs.mongodb.com/
MongoDB Atlas: https://www.mongodb.com/cloud/atlas
MongoDB Community: https://www.mongodb.com/community/forums
