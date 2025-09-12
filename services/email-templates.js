const generateReleaseEmailHTML = ({ title, posterPath, releaseDate, followType, tmdbId }) => {
  const isStreaming = followType === 'streaming';
  const releaseIcon = isStreaming ? '📺' : '🎬';
  const releaseTypeText = isStreaming ? 'available for streaming' : 'now in theaters';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Release Notification</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px;">
                <!-- Main Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: linear-gradient(135deg, #121212 0%, #1a1a1a 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="font-size: 32px; line-height: 1;">${releaseIcon}</span>
                            </div>
                            <h1 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #1a1a1a; margin: 0; letter-spacing: -0.3px;">
                                Release Day!
                            </h1>
                            <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0; font-weight: 600;">
                                Your followed movie is now available
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Movie Content -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 48px 32px;">
                            
                            <!-- Movie Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                                <tr>
                                    <td style="padding: 32px; text-align: center;">
                                        
                                        ${posterPath ? `
                                        <!-- Movie Poster -->
                                        <img src="https://image.tmdb.org/t/p/w500${posterPath}" 
                                             alt="${title} poster" 
                                             width="200" 
                                             height="300"
                                             style="width: 200px; height: 300px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
                                        ` : ''}
                                        
                                        <!-- Movie Title -->
                                        <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #f3d96b; margin: 0 0 20px 0; text-align: center; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(243, 217, 107, 0.3);">
                                            ${title}
                                        </h2>
                                        
                                        <!-- Release Info Box -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(90deg, rgba(243, 217, 107, 0.1) 0%, rgba(216, 185, 75, 0.1) 100%); border: 1px solid rgba(243, 217, 107, 0.2); border-radius: 8px; margin: 24px 0;">
                                            <tr>
                                                <td style="padding: 20px; text-align: center;">
                                                    <p style="font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 8px 0;">
                                                        ${releaseDate}
                                                    </p>
                                                    <p style="font-size: 14px; color: #ccc; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                                                        ${releaseTypeText}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 32px auto;">
                                            <tr>
                                                <td style="border-radius: 8px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); box-shadow: 0 4px 12px rgba(243, 217, 107, 0.3);">
                                                    <a href="https://moviereleasetrackerv2.onrender.com/movie/${tmdbId}" 
                                                       style="display: inline-block; padding: 16px 32px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: 'Segoe UI', sans-serif;">
                                                        View Movie Details
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Follow Info -->
                            <p style="color: #ccc; text-align: center; margin: 32px 0 16px 0; font-size: 15px; line-height: 1.5;">
                                You're receiving this because you followed the <strong style="color: #f3d96b;">${followType}</strong> release of <strong style="color: #f3d96b;">${title}</strong> on Movie Release Tracker.
                            </p>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #111; padding: 32px; text-align: center; color: #888; font-size: 14px; border-radius: 0 0 12px 12px;">
                            <a href="https://moviereleasetrackerv2.onrender.com" style="display: block; text-decoration: none;">
                                <img src="https://i.postimg.cc/yx3hck35/Untitled.png" 
                                     alt="Movie Release Tracker" 
                                     width="40" 
                                     height="40"
                                     style="height: 40px; width: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                            </a>
                            <p style="margin: 0 0 12px 0; color: #ccc;">Never miss your favorite movie releases</p>
                            <p style="margin: 0; line-height: 1.4;">
                                <a href="https://moviereleasetrackerv2.onrender.com/my-movies" style="color: #f3d96b; text-decoration: none;">Manage Movies</a> | 
                                <a href="https://moviereleasetrackerv2.onrender.com/settings" style="color: #f3d96b; text-decoration: none;">Settings</a>
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

const generateTheatricalDateEmailHTML = ({ title, posterPath, theatricalDate, tmdbId }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Theatrical Date Available</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px;">
                <!-- Main Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: linear-gradient(135deg, #121212 0%, #1a1a1a 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="font-size: 32px; line-height: 1;">🎬</span>
                            </div>
                            <h1 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #1a1a1a; margin: 0; letter-spacing: -0.3px;">
                                Theatrical Date Added!
                            </h1>
                            <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0; font-weight: 600;">
                                We found the theatrical release date
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Movie Content -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 48px 32px;">
                            
                            <!-- Movie Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                                <tr>
                                    <td style="padding: 32px; text-align: center;">
                                        
                                        ${posterPath ? `
                                        <!-- Movie Poster -->
                                        <img src="https://image.tmdb.org/t/p/w500${posterPath}" 
                                             alt="${title} poster" 
                                             width="200" 
                                             height="300"
                                             style="width: 200px; height: 300px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
                                        ` : ''}
                                        
                                        <!-- Movie Title -->
                                        <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #f3d96b; margin: 0 0 20px 0; text-align: center; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(243, 217, 107, 0.3);">
                                            ${title}
                                        </h2>
                                        
                                        <!-- Theatrical Date Info Box -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(90deg, rgba(243, 217, 107, 0.1) 0%, rgba(216, 185, 75, 0.1) 100%); border: 1px solid rgba(243, 217, 107, 0.2); border-radius: 8px; margin: 24px 0;">
                                            <tr>
                                                <td style="padding: 20px; text-align: center;">
                                                    <p style="font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 8px 0;">
                                                        ${theatricalDate}
                                                    </p>
                                                    <p style="font-size: 14px; color: #ccc; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                                                        Theatrical release date
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Info Message -->
                                        <p style="color: #ccc; font-size: 16px; line-height: 1.5; margin: 24px 0;">
                                            We'll send you another notification when this movie hits theaters.
                                        </p>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 32px auto;">
                                            <tr>
                                                <td style="border-radius: 8px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); box-shadow: 0 4px 12px rgba(243, 217, 107, 0.3);">
                                                    <a href="https://moviereleasetrackerv2.onrender.com/movie/${tmdbId}" 
                                                       style="display: inline-block; padding: 16px 32px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: 'Segoe UI', sans-serif;">
                                                        View Movie Details
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Follow Info -->
                            <p style="color: #ccc; text-align: center; margin: 32px 0 16px 0; font-size: 15px; line-height: 1.5;">
                                You're receiving this because you followed the <strong style="color: #f3d96b;">theatrical</strong> release of <strong style="color: #f3d96b;">${title}</strong> on Movie Release Tracker.
                            </p>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #111; padding: 32px; text-align: center; color: #888; font-size: 14px; border-radius: 0 0 12px 12px;">
                            <a href="https://moviereleasetrackerv2.onrender.com" style="display: block; text-decoration: none;">
                                <img src="https://i.postimg.cc/yx3hck35/Untitled.png" 
                                     alt="Movie Release Tracker" 
                                     width="40" 
                                     height="40"
                                     style="height: 40px; width: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                            </a>
                            <p style="margin: 0 0 12px 0; color: #ccc;">Never miss your favorite movie releases</p>
                            <p style="margin: 0; line-height: 1.4;">
                                <a href="https://moviereleasetrackerv2.onrender.com/my-movies" style="color: #f3d96b; text-decoration: none;">Manage Movies</a> | 
                                <a href="https://moviereleasetrackerv2.onrender.com/settings" style="color: #f3d96b; text-decoration: none;">Settings</a>
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

const generateStreamingDateEmailHTML = ({ title, posterPath, streamingDate, tmdbId }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Streaming Date Available</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px;">
                <!-- Main Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: linear-gradient(135deg, #121212 0%, #1a1a1a 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="font-size: 32px; line-height: 1;">📺</span>
                            </div>
                            <h1 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #1a1a1a; margin: 0; letter-spacing: -0.3px;">
                                Streaming Date Added!
                            </h1>
                            <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0; font-weight: 600;">
                                We found the streaming release date
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Movie Content -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 48px 32px;">
                            
                            <!-- Movie Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                                <tr>
                                    <td style="padding: 32px; text-align: center;">
                                        
                                        ${posterPath ? `
                                        <!-- Movie Poster -->
                                        <img src="https://image.tmdb.org/t/p/w500${posterPath}" 
                                             alt="${title} poster" 
                                             width="200" 
                                             height="300"
                                             style="width: 200px; height: 300px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
                                        ` : ''}
                                        
                                        <!-- Movie Title -->
                                        <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #f3d96b; margin: 0 0 20px 0; text-align: center; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(243, 217, 107, 0.3);">
                                            ${title}
                                        </h2>
                                        
                                        <!-- Streaming Date Info Box -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(90deg, rgba(243, 217, 107, 0.1) 0%, rgba(216, 185, 75, 0.1) 100%); border: 1px solid rgba(243, 217, 107, 0.2); border-radius: 8px; margin: 24px 0;">
                                            <tr>
                                                <td style="padding: 20px; text-align: center;">
                                                    <p style="font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 8px 0;">
                                                        ${streamingDate}
                                                    </p>
                                                    <p style="font-size: 14px; color: #ccc; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                                                        Streaming release date
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Info Message -->
                                        <p style="color: #ccc; font-size: 16px; line-height: 1.5; margin: 24px 0;">
                                            We'll send you another notification when this movie is actually available for streaming.
                                        </p>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 32px auto;">
                                            <tr>
                                                <td style="border-radius: 8px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); box-shadow: 0 4px 12px rgba(243, 217, 107, 0.3);">
                                                    <a href="https://moviereleasetrackerv2.onrender.com/movie/${tmdbId}" 
                                                       style="display: inline-block; padding: 16px 32px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: 'Segoe UI', sans-serif;">
                                                        View Movie Details
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Follow Info -->
                            <p style="color: #ccc; text-align: center; margin: 32px 0 16px 0; font-size: 15px; line-height: 1.5;">
                                You're receiving this because you followed the <strong style="color: #f3d96b;">streaming</strong> release of <strong style="color: #f3d96b;">${title}</strong> on Movie Release Tracker.
                            </p>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #111; padding: 32px; text-align: center; color: #888; font-size: 14px; border-radius: 0 0 12px 12px;">
                            <a href="https://moviereleasetrackerv2.onrender.com" style="display: block; text-decoration: none;">
                                <img src="https://i.postimg.cc/yx3hck35/Untitled.png" 
                                     alt="Movie Release Tracker" 
                                     width="40" 
                                     height="40"
                                     style="height: 40px; width: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                            </a>
                            <p style="margin: 0 0 12px 0; color: #ccc;">Never miss your favorite movie releases</p>
                            <p style="margin: 0; line-height: 1.4;">
                                <a href="https://moviereleasetrackerv2.onrender.com/my-movies" style="color: #f3d96b; text-decoration: none;">Manage Movies</a> | 
                                <a href="https://moviereleasetrackerv2.onrender.com/settings" style="color: #f3d96b; text-decoration: none;">Settings</a>
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

const generateReleaseBatchEmailHTML = ({ movies, date }) => {
  const theatricalMovies = movies.filter(m => m.followType === 'theatrical');
  const streamingMovies = movies.filter(m => m.followType === 'streaming');
  const totalCount = movies.length;
  
  // Clean header emoji logic - show types present, not count
  let headerEmojis = '';
  if (theatricalMovies.length > 0 && streamingMovies.length > 0) {
    headerEmojis = '🎬📺'; // Mixed: both types
  } else if (theatricalMovies.length > 0) {
    headerEmojis = '🎬';   // Only theatrical
  } else {
    headerEmojis = '📺';   // Only streaming
  }
  
  const pluralMovies = totalCount === 1 ? 'movie is' : 'movies are';
  
  const generateMovieCard = (movie) => {
    const isStreaming = movie.followType === 'streaming';
    const releaseTypeText = isStreaming ? 'available for streaming' : 'now in theaters';
    
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); margin-bottom: 24px;">
        <tr>
          <td style="padding: 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                ${movie.posterPath ? `
                <td width="120" style="padding-right: 20px; vertical-align: top;">
                  <img src="https://image.tmdb.org/t/p/w500${movie.posterPath}" 
                       alt="${movie.title} poster" 
                       width="120" 
                       height="180"
                       style="width: 120px; height: 180px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); display: block;" />
                </td>
                ` : ''}
                <td style="vertical-align: top;">
                  <h3 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 600; color: #f3d96b; margin: 0 0 16px 0; letter-spacing: -0.3px; text-shadow: 0 2px 8px rgba(243, 217, 107, 0.3);">
                    ${movie.title}
                  </h3>
                  
                  <div style="background: linear-gradient(90deg, rgba(243, 217, 107, 0.1) 0%, rgba(216, 185, 75, 0.1) 100%); border: 1px solid rgba(243, 217, 107, 0.2); border-radius: 6px; padding: 12px; margin-bottom: 16px; display: inline-block;">
                    <p style="font-size: 16px; font-weight: 600; color: #f3d96b; margin: 0 0 4px 0;">
                      ${movie.releaseDate}
                    </p>
                    <p style="font-size: 12px; color: #ccc; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                      ${releaseTypeText}
                    </p>
                  </div>
                  
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="border-radius: 6px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); box-shadow: 0 3px 8px rgba(243, 217, 107, 0.3);">
                        <a href="https://moviereleasetrackerv2.onrender.com/movie/${movie.id}" 
                           style="display: inline-block; padding: 10px 20px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; font-family: 'Segoe UI', sans-serif;">
                          View Details
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Release Day - ${totalCount} Movies Available</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px;">
                <!-- Main Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: linear-gradient(135deg, #121212 0%, #1a1a1a 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="font-size: 32px; line-height: 1;">${headerEmojis}</span>
                            </div>
                            <h1 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #1a1a1a; margin: 0; letter-spacing: -0.3px;">
                                Release Day!
                            </h1>
                            <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0; font-weight: 600;">
                                ${totalCount} of your followed ${pluralMovies} available today
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Movie Content -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 48px 32px;">
                            
                            ${theatricalMovies.length > 0 ? `
                            <!-- Theatrical Releases Section -->
                            <div style="margin-bottom: 32px;">
                                <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 24px 0; padding-bottom: 12px; border-bottom: 1px solid #333;">
                                    🎬 Now in Theaters (${theatricalMovies.length})
                                </h2>
                                ${theatricalMovies.map(generateMovieCard).join('')}
                            </div>
                            ` : ''}
                            
                            ${streamingMovies.length > 0 ? `
                            <!-- Streaming Releases Section -->
                            <div style="margin-bottom: 32px;">
                                <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 24px 0; padding-bottom: 12px; border-bottom: 1px solid #333;">
                                    📺 Available for Streaming (${streamingMovies.length})
                                </h2>
                                ${streamingMovies.map(generateMovieCard).join('')}
                            </div>
                            ` : ''}
                            
                            <!-- Follow Info -->
                            <p style="color: #ccc; text-align: center; margin: 32px 0 16px 0; font-size: 15px; line-height: 1.5;">
                                You're receiving this because you followed these movies on Movie Release Tracker.
                            </p>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #111; padding: 32px; text-align: center; color: #888; font-size: 14px; border-radius: 0 0 12px 12px;">
                            <a href="https://moviereleasetrackerv2.onrender.com" style="display: block; text-decoration: none;">
                                <img src="https://i.postimg.cc/yx3hck35/Untitled.png" 
                                     alt="Movie Release Tracker" 
                                     width="40" 
                                     height="40"
                                     style="height: 40px; width: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                            </a>
                            <p style="margin: 0 0 12px 0; color: #ccc;">Never miss your favorite movie releases</p>
                            <p style="margin: 0; line-height: 1.4;">
                                <a href="https://moviereleasetrackerv2.onrender.com/my-movies" style="color: #f3d96b; text-decoration: none;">Manage Movies</a> | 
                                <a href="https://moviereleasetrackerv2.onrender.com/settings" style="color: #f3d96b; text-decoration: none;">Settings</a>
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

const generateDatesBatchEmailHTML = ({ theatricalMovies = [], streamingMovies = [] }) => {
  const totalCount = theatricalMovies.length + streamingMovies.length;
  const pluralMovies = totalCount === 1 ? 'movie' : 'movies';
  
  const generateDateMovieCard = (movie, type) => {
    const isStreaming = type === 'streaming';
    const dateLabel = isStreaming ? 'Streaming release date' : 'Theatrical release date';
    const icon = isStreaming ? '📺' : '🎬';
    
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); margin-bottom: 24px;">
        <tr>
          <td style="padding: 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                ${movie.posterPath ? `
                <td width="120" style="padding-right: 20px; vertical-align: top;">
                  <img src="https://image.tmdb.org/t/p/w500${movie.posterPath}" 
                       alt="${movie.title} poster" 
                       width="120" 
                       height="180"
                       style="width: 120px; height: 180px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); display: block;" />
                </td>
                ` : ''}
                <td style="vertical-align: top;">
                  <h3 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 600; color: #f3d96b; margin: 0 0 16px 0; letter-spacing: -0.3px; text-shadow: 0 2px 8px rgba(243, 217, 107, 0.3);">
                    ${movie.title}
                  </h3>
                  
                  <div style="background: linear-gradient(90deg, rgba(243, 217, 107, 0.1) 0%, rgba(216, 185, 75, 0.1) 100%); border: 1px solid rgba(243, 217, 107, 0.2); border-radius: 6px; padding: 12px; margin-bottom: 16px; display: inline-block;">
                    <p style="font-size: 16px; font-weight: 600; color: #f3d96b; margin: 0 0 4px 0;">
                      ${isStreaming ? movie.streamingDate : movie.theatricalDate}
                    </p>
                    <p style="font-size: 12px; color: #ccc; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                      ${dateLabel}
                    </p>
                  </div>
                  
                  <p style="color: #ccc; font-size: 14px; line-height: 1.4; margin: 12px 0;">
                    We'll send you another notification when this movie ${isStreaming ? 'is available for streaming' : 'hits theaters'}.
                  </p>
                  
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="border-radius: 6px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); box-shadow: 0 3px 8px rgba(243, 217, 107, 0.3);">
                        <a href="https://moviereleasetrackerv2.onrender.com/movie/${movie.tmdbId}" 
                           style="display: inline-block; padding: 10px 20px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; font-family: 'Segoe UI', sans-serif;">
                          View Details
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Release Dates - ${totalCount} Movies Updated</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px;">
                <!-- Main Email Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: linear-gradient(135deg, #121212 0%, #1a1a1a 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="font-size: 32px; line-height: 1;">📅</span>
                            </div>
                            <h1 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 600; color: #1a1a1a; margin: 0; letter-spacing: -0.3px;">
                                New Dates Added!
                            </h1>
                            <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0; font-weight: 600;">
                                We found release dates for ${totalCount} ${pluralMovies}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Movie Content -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 48px 32px;">
                            
                            ${theatricalMovies.length > 0 ? `
                            <!-- Theatrical Dates Section -->
                            <div style="margin-bottom: 32px;">
                                <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 24px 0; padding-bottom: 12px; border-bottom: 1px solid #333;">
                                    🎬 Theatrical Dates Added (${theatricalMovies.length})
                                </h2>
                                ${theatricalMovies.map(movie => generateDateMovieCard(movie, 'theatrical')).join('')}
                            </div>
                            ` : ''}
                            
                            ${streamingMovies.length > 0 ? `
                            <!-- Streaming Dates Section -->
                            <div style="margin-bottom: 32px;">
                                <h2 style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; color: #f3d96b; margin: 0 0 24px 0; padding-bottom: 12px; border-bottom: 1px solid #333;">
                                    📺 Streaming Dates Added (${streamingMovies.length})
                                </h2>
                                ${streamingMovies.map(movie => generateDateMovieCard(movie, 'streaming')).join('')}
                            </div>
                            ` : ''}
                            
                            <!-- Follow Info -->
                            <p style="color: #ccc; text-align: center; margin: 32px 0 16px 0; font-size: 15px; line-height: 1.5;">
                                You're receiving this because you followed these movies on Movie Release Tracker.
                            </p>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #111; padding: 32px; text-align: center; color: #888; font-size: 14px; border-radius: 0 0 12px 12px;">
                            <a href="https://moviereleasetrackerv2.onrender.com" style="display: block; text-decoration: none;">
                                <img src="https://i.postimg.cc/yx3hck35/Untitled.png" 
                                     alt="Movie Release Tracker" 
                                     width="40" 
                                     height="40"
                                     style="height: 40px; width: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />
                            </a>
                            <p style="margin: 0 0 12px 0; color: #ccc;">Never miss your favorite movie releases</p>
                            <p style="margin: 0; line-height: 1.4;">
                                <a href="https://moviereleasetrackerv2.onrender.com/my-movies" style="color: #f3d96b; text-decoration: none;">Manage Movies</a> | 
                                <a href="https://moviereleasetrackerv2.onrender.com/settings" style="color: #f3d96b; text-decoration: none;">Settings</a>
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

module.exports = {
  generateReleaseEmailHTML,
  generateStreamingDateEmailHTML,
  generateTheatricalDateEmailHTML,
  generateReleaseBatchEmailHTML,
  generateDatesBatchEmailHTML
};