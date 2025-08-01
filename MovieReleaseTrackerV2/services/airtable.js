// services/airtable.js
const axios = require('axios');
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = 'Users';  // your users table
const AIRTABLE_FOLLOWED_MOVIES_TABLE = 'FollowedMovies'; // your followed movies table
const PAT = process.env.AIRTABLE_API_KEY; // Your Personal Access Token

const airtableAxios = axios.create({
  baseURL: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/`,
  headers: {
    Authorization: `Bearer ${PAT}`,
    'Content-Type': 'application/json',
  },
});

async function getUsersByEmail(email) {
  try {
    const filterFormula = `LOWER({Email}) = '${email.toLowerCase()}'`;
    const response = await airtableAxios.get(`${AIRTABLE_USERS_TABLE}`, {
      params: { filterByFormula: filterFormula },
    });
    return response.data.records;
  } catch (error) {
    console.error('Airtable getUsersByEmail error:', error.response?.data || error.message);
    throw error;
  }
}

async function createUser(userData) {
  try {
    const response = await airtableAxios.post(AIRTABLE_USERS_TABLE, {
      fields: userData,
    });
    return response.data;
  } catch (error) {
    console.error('Airtable createUser error:', error.response?.data || error.message);
    throw error;
  }
}

// Get followed movies for a user by their Airtable record ID
async function getFollowedMoviesByUserId(userId) {
  try {
    const filterFormula = `{UserID} = '${userId}'`;
    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: {
        filterByFormula: filterFormula,
      },
    });
    return response.data.records;
  } catch (error) {
    console.error('Airtable getFollowedMoviesByUserId error:', error.response?.data || error.message);
    throw error;
  }
}

async function followMovie(airtableUserRecordId, movieData) {
  try {
    const response = await airtableAxios.post('FollowedMovies', {
      fields: {
        ...movieData,
        User: [airtableUserRecordId],     // Keep linked record for Airtable relations
        UserID: movieData.UserID,          // Also set string UserID for filtering by string
        PosterPath: movieData.PosterPath // new poster path field
      },
    });
    return response.data;
  } catch (error) {
    console.error('Airtable followMovie error:', error.response?.data || error.message);
    throw error;
  }
}

async function unfollowMovie(userId, tmdbId) {
  try {
    const response = await airtableAxios.get('FollowedMovies', {
      params: {
        filterByFormula: `AND({UserID} = "${userId}", {TMDB_ID} = ${tmdbId})`
      }
    });

    const records = response.data.records;
    if (records.length === 0) return false;

    const deleteId = records[0].id;
    await airtableAxios.delete(`FollowedMovies/${deleteId}`);
    return true;
  } catch (error) {
    console.error('Airtable unfollowMovie error:', error.response?.data || error.message);
    throw error;
  }
}


module.exports = {
  airtableAxios,
  getUsersByEmail,
  createUser,
  getFollowedMoviesByUserId,
  followMovie,
  unfollowMovie,
};
