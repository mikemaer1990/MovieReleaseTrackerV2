// services/airtable.js
const axios = require("axios");
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = "Users"; // your users table
const AIRTABLE_FOLLOWED_MOVIES_TABLE = "FollowedMovies"; // your followed movies table
const PAT = process.env.AIRTABLE_API_KEY; // Your Personal Access Token

const airtableAxios = axios.create({
  baseURL: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/`,
  headers: {
    Authorization: `Bearer ${PAT}`,
    "Content-Type": "application/json",
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
    console.error(
      "Airtable getUsersByEmail error:",
      error.response?.data || error.message
    );
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
    console.error(
      "Airtable createUser error:",
      error.response?.data || error.message
    );
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
    console.error(
      "Airtable getFollowedMoviesByUserId error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function followMovie(airtableUserRecordId, movieData) {
  try {
    const response = await airtableAxios.post("FollowedMovies", {
      fields: {
        ...movieData,
        FollowType: movieData.FollowType, // 'Theatrical' or 'Streaming'
        StreamingDateAvailable:
          movieData.FollowType === "Streaming" &&
          Boolean(movieData.ReleaseDate),
        StreamingReleaseDate:
          movieData.FollowType === "Streaming"
            ? movieData.ReleaseDate || null
            : null,
        User: [airtableUserRecordId],
        UserID: movieData.UserID,
        PosterPath: movieData.PosterPath,
      },
    });
    return response.data;
  } catch (error) {
    console.error(
      "Airtable followMovie error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function unfollowMovie(userId, tmdbId, followType = null) {
  try {
    let filterFormula;

    if (followType && followType.toLowerCase() !== "both") {
      // Specific follow type
      filterFormula = `AND(
        {UserID} = "${userId}",
        {TMDB_ID} = ${tmdbId},
        {FollowType} = "${followType.toLowerCase()}"
      )`;
    } else if (followType && followType.toLowerCase() === "both") {
      // Both types: theatrical or streaming
      filterFormula = `AND(
        {UserID} = "${userId}",
        {TMDB_ID} = ${tmdbId},
        OR({FollowType} = "theatrical", {FollowType} = "streaming")
      )`;
    } else {
      // No followType specified: just user and movie
      filterFormula = `AND(
        {UserID} = "${userId}",
        {TMDB_ID} = ${tmdbId}
      )`;
    }

    const response = await airtableAxios.get("FollowedMovies", {
      params: { filterByFormula: filterFormula },
    });

    const records = response.data.records;
    if (records.length === 0) return false;

    await Promise.all(
      records.map((record) =>
        airtableAxios.delete(`FollowedMovies/${record.id}`)
      )
    );

    return true;
  } catch (error) {
    console.error(
      "Airtable unfollowMovie error:",
      error.response?.data || error.message
    );
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
