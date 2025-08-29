# Vroom iOS App

A native iOS Swift conversion of the React Native Vroom social media app. This app provides a TikTok-like experience with vertical video feeds, camera functionality, social features, and community groups.

## Features

### Core Features
- **Vertical Video Feed**: TikTok-style video player with autoplay and gesture controls
- **Authentication**: Sign up/login with Supabase
- **Camera & Upload**: Record videos, take photos, and create posts
- **Social Interactions**: Like, comment, and share posts
- **User Profiles**: View and edit user profiles with post grids
- **Real-time Updates**: Live like/comment count updates

### Additional Features (Placeholders)
- Groups and Forums
- Direct Messaging
- Push Notifications
- Ad Integration (Google Mobile Ads)

## Tech Stack

- **Language**: Swift 5.9+
- **Framework**: SwiftUI
- **Minimum iOS**: 15.0+
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Video**: AVKit/AVFoundation
- **Dependencies**: 
  - Supabase Swift SDK
  - Google Mobile Ads SDK

## Project Structure

```
Sources/VroomApp/
├── Models/              # Data models (Post, Profile, Comment)
├── Views/               # SwiftUI views (main screens)
├── ViewModels/          # ObservableObject view models
├── Services/            # API and business logic
├── Components/          # Reusable UI components
└── Utils/               # Helper utilities and pickers
```

## Setup Instructions

### Prerequisites
- Xcode 15.0+
- iOS 15.0+ device/simulator
- Supabase project with the following setup:
  - Authentication enabled
  - Tables: `posts`, `profiles`, `comments`, `post_likes`
  - Storage bucket for media files
  - Row Level Security (RLS) policies

### Installation

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd vroom-ios
   ```

2. **Install Dependencies**
   The project uses Swift Package Manager. Dependencies will be resolved automatically when you open the project in Xcode.

3. **Configure Supabase**
   - Update `Sources/VroomApp/Services/SupabaseService.swift` with your Supabase URL and API key
   - Ensure your Supabase database schema matches the models

4. **Open in Xcode**
   ```bash
   open VroomApp.xcodeproj
   ```

5. **Build and Run**
   - Select your target device/simulator
   - Press ⌘+R to build and run

### Database Schema

The app expects the following Supabase tables:

#### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE,
  avatar_url TEXT,
  first_name TEXT,
  last_name TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### posts
```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  media_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id),
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### comments
```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  post_id UUID REFERENCES posts(id),
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### post_likes
```sql
CREATE TABLE post_likes (
  user_id UUID REFERENCES profiles(id),
  post_id UUID REFERENCES posts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
```

## Key Differences from React Native Version

### Architecture
- **State Management**: SwiftUI's `@StateObject` and `@ObservableObject` instead of React hooks
- **Navigation**: SwiftUI's `NavigationView` and `TabView` instead of React Navigation
- **API Calls**: Swift's async/await instead of JavaScript promises

### UI Framework
- **SwiftUI**: Declarative UI framework similar to React but with Swift syntax
- **AVKit**: Native video playback instead of Expo AV
- **Camera**: UIImagePickerController and PHPickerViewController instead of Expo Camera

### Performance
- **Native Performance**: Better performance for video playback and camera operations
- **Memory Management**: Automatic reference counting instead of garbage collection
- **Battery Optimization**: Native iOS optimizations for battery life

## Development Notes

### Current Implementation Status
✅ **Completed Features:**
- Basic project structure and dependencies
- Authentication flow with Supabase
- Video feed with vertical scrolling
- Camera capture and photo selection
- Like/comment functionality
- User profiles and post grids
- Real-time updates via Supabase channels

🚧 **Pending Features:**
- Media upload to Supabase Storage
- Groups and Forums implementation
- Direct messaging system
- Push notifications
- Google Mobile Ads integration
- Advanced camera features (filters, effects)

### Known Limitations
1. **Media Upload**: Currently placeholder - needs Supabase Storage integration
2. **Video Compression**: May need optimization for large video files
3. **Offline Support**: No offline caching implemented
4. **Error Handling**: Basic error handling - needs improvement for production

### Next Steps
1. Implement media upload to Supabase Storage
2. Add comprehensive error handling and loading states
3. Implement remaining social features (groups, messaging)
4. Add push notifications
5. Integrate advertising SDK
6. Performance optimization and testing
7. App Store submission preparation

## Contributing

1. Follow Swift coding conventions
2. Use SwiftUI best practices
3. Maintain the existing architecture patterns
4. Add appropriate comments for complex logic
5. Test on both iPhone and iPad

## License

[Add your license information here]