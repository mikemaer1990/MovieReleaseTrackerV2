# TODO: Active Tasks

## 🔒 SECURITY IMPROVEMENTS (Priority: HIGH)

### HTTP Security Headers
- [ ] Add helmet.js middleware for security headers (CSP, HSTS, X-Frame-Options)
- [ ] Install: `npm install helmet`
- [ ] **Impact**: Major security improvement, 5-minute implementation

### Production Logging Cleanup
- [ ] Replace 183+ console.log statements with proper logging or conditional logging
- [ ] Consider winston for structured logging
- [ ] **Impact**: Cleaner production logs, better debugging

## ⚡ PERFORMANCE OPTIMIZATIONS (Priority: MEDIUM)

### Static Asset Optimization
- [ ] Add compression middleware (gzip) - `npm install compression`
- [ ] Add browser caching headers for CSS/JS/images
- [ ] **Impact**: 30-70% smaller file sizes, faster loading

### Image & Asset Loading
- [ ] Implement lazy loading for movie posters
- [ ] Add image caching strategy
- [ ] Consider WebP format for better compression

## 🚀 USER EXPERIENCE IMPROVEMENTS (Priority: LOW)

### Interactive Feedback
- [ ] Add loading spinners for follow/unfollow actions
- [ ] Add toast notifications for user feedback
- [ ] Improve error messages with helpful suggestions

### SEO & Accessibility
- [ ] Add meta descriptions for movie pages
- [ ] Improve alt text for movie posters
- [ ] Add structured data for movies (JSON-LD)

### Mobile Enhancements
- [ ] Add web app manifest for "Add to Home Screen" capability
- [ ] Consider basic service worker for offline functionality

## 🔧 CODE QUALITY (Priority: LOW)

### Package.json & Scripts
- [ ] Update package.json metadata (name, description, author)
- [ ] Add proper start script for production
- [ ] Add health check endpoint

### Error Handling
- [ ] Create custom 404/500 error pages with site branding
- [ ] Improve rate limiting user feedback
- [ ] Add graceful API failure handling


# Server Improvements & Security

## Priority: Medium

### Security Improvements
- [ ] Enable firewall with UFW (allow SSH, HTTP, HTTPS only)
- [ ] Secure environment file permissions (chmod 600 .env)
- [ ] Enable automatic security updates via unattended-upgrades

### Monitoring & Performance
- [ ] Install htop for resource monitoring
- [ ] Set up basic server monitoring with PM2 monit

### SSL Enhancement
- [ ] Upgrade Cloudflare SSL from Flexible to Full (strict) mode

### Commands Reference
```bash
# Firewall setup
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# File permissions
chmod 600 /var/www/movietracker/.env

# Auto updates
apt install unattended-upgrades
dpkg-reconfigure unattended-upgrades

# Monitoring tools
apt install htop
pm2 monit
```

---

## 📋 COMPLETED ISSUES (Archive)

### ✅ Horizontal Scrollbar Fix (COMPLETED)
**Fixed**: Eliminated horizontal scrollbar across all pages except home
- **Root Cause**: Navbar search form overflow on mobile devices
- **Solution**: Pure flexbox approach with layout containment and defensive CSS
- **Files Modified**: `base.css`, `navbar.css`, `layout.ejs`
- **Deployed**: Production ready

### ✅ Streaming Date Capture Issue (COMPLETED)
**Fixed**: Streaming dates now properly captured for Netflix exclusives
- **Root Cause**: Case sensitivity in `services/airtable.js` (`"Streaming"` vs `"streaming"`)
- **Solution**: Fixed follow logic and field references
- **Testing**: Verified with "Wake Up Dead Man: A Knives Out Mystery"