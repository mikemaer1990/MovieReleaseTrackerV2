#!/usr/bin/env node

/**
 * Airtable Date Correction Script
 * 
 * This script scans all movies in the FollowedMovies table and updates them
 * with correct unified release dates that prioritize US theatrical over primary.
 * 
 * Usage: node fix-airtable-dates.js [--dry-run] [--limit=N]
 */

require('dotenv').config();
const { getReleaseData } = require('./services/tmdb');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitMatch = args.find(arg => arg.startsWith('--limit='));
const limit = limitMatch ? parseInt(limitMatch.split('=')[1]) : null;

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_FOLLOWED_MOVIES_TABLE');
  process.exit(1);
}

// Airtable API helper
async function fetchAllRecords() {
  const axios = require('axios');
  const records = [];
  let offset = null;
  
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      params
    });
    
    records.push(...response.data.records);
    offset = response.data.offset;
  } while (offset);
  
  return records;
}

async function updateRecord(recordId, fields) {
  const axios = require('axios');
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  
  await axios.patch(url, {
    fields
  }, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
  });
}

// Date comparison helper
function formatDate(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

// Main correction logic
async function fixAirtableDates() {
  console.log('🔧 Airtable Date Correction Script');
  console.log('==================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE UPDATE'}`);
  if (limit) console.log(`Limit: Processing first ${limit} records only`);
  console.log('');
  
  try {
    console.log('📥 Fetching all records from Airtable...');
    const records = await fetchAllRecords();
    console.log(`   Found ${records.length} total records`);
    
    // Group by TMDB_ID to avoid duplicate API calls
    const movieGroups = new Map();
    records.forEach(record => {
      const tmdbId = record.fields.TMDB_ID;
      if (tmdbId) {
        if (!movieGroups.has(tmdbId)) {
          movieGroups.set(tmdbId, []);
        }
        movieGroups.get(tmdbId).push(record);
      }
    });
    
    console.log(`   Grouped into ${movieGroups.size} unique movies`);
    
    const moviesToProcess = limit ? 
      Array.from(movieGroups.entries()).slice(0, limit) : 
      Array.from(movieGroups.entries());
    
    console.log(`   Processing ${moviesToProcess.length} movies...`);
    console.log('');
    
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const [tmdbId, movieRecords] of moviesToProcess) {
      try {
        processedCount++;
        const firstRecord = movieRecords[0];
        const movieTitle = firstRecord.fields.Title || `TMDB_${tmdbId}`;
        
        console.log(`[${processedCount}/${moviesToProcess.length}] Processing: ${movieTitle} (ID: ${tmdbId})`);
        
        // Get unified release data
        const releaseData = await getReleaseData(tmdbId);
        const correctTheatricalDate = releaseData.usTheatrical || releaseData.primary;
        const correctStreamingDate = releaseData.streaming;
        
        console.log(`   Current data from TMDB:`);
        console.log(`     US Theatrical: ${releaseData.usTheatrical || 'None'}`);
        console.log(`     Streaming: ${releaseData.streaming || 'None'}`);  
        console.log(`     Primary: ${releaseData.primary || 'None'}`);
        console.log(`     → Using Theatrical: ${correctTheatricalDate || 'None'}`);
        console.log(`     → Using Streaming: ${correctStreamingDate || 'None'}`);
        
        // Check each record for this movie
        for (const record of movieRecords) {
          const followType = record.fields.FollowType?.toLowerCase();
          const currentReleaseDate = formatDate(record.fields.ReleaseDate);
          const currentStreamingDate = formatDate(record.fields.StreamingReleaseDate);
          
          let needsUpdate = false;
          const updates = {};
          
          // Check theatrical date (for both theatrical and streaming follows)
          if (correctTheatricalDate && formatDate(correctTheatricalDate) !== currentReleaseDate) {
            updates.ReleaseDate = correctTheatricalDate;
            needsUpdate = true;
            console.log(`     Record ${record.id} (${followType}): Theatrical ${currentReleaseDate} → ${correctTheatricalDate}`);
          }
          
          // Check streaming date (for streaming follows)
          if (followType === 'streaming' || followType === 'both') {
            if (correctStreamingDate && formatDate(correctStreamingDate) !== currentStreamingDate) {
              updates.StreamingReleaseDate = correctStreamingDate;
              updates.StreamingDateAvailable = true;
              needsUpdate = true;
              console.log(`     Record ${record.id} (${followType}): Streaming ${currentStreamingDate || 'None'} → ${correctStreamingDate}`);
            } else if (!correctStreamingDate && currentStreamingDate) {
              updates.StreamingReleaseDate = null;
              updates.StreamingDateAvailable = false;
              needsUpdate = true;
              console.log(`     Record ${record.id} (${followType}): Streaming ${currentStreamingDate} → None (removed)`);
            }
          }
          
          // Apply updates
          if (needsUpdate) {
            if (!dryRun) {
              await updateRecord(record.id, updates);
              console.log(`     ✅ Updated record ${record.id}`);
            } else {
              console.log(`     🔍 Would update record ${record.id} (dry run)`);
            }
            updatedCount++;
          } else {
            console.log(`     ✓ Record ${record.id} (${followType}) is already correct`);
          }
        }
        
        console.log('');
        
        // Rate limiting - don't hammer TMDB API
        await new Promise(resolve => setTimeout(resolve, 250)); // 250ms delay between requests
        
      } catch (error) {
        errorCount++;
        console.error(`     ❌ Error processing movie ${tmdbId}: ${error.message}`);
        console.log('');
      }
    }
    
    // Summary
    console.log('📊 Summary');
    console.log('==========');
    console.log(`Movies processed: ${processedCount}`);
    console.log(`Records updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN - No actual changes made' : 'LIVE UPDATE - Changes applied'}`);
    
    if (dryRun) {
      console.log('');
      console.log('💡 To apply these changes, run:');
      console.log('   node fix-airtable-dates.js');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
fixAirtableDates().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});