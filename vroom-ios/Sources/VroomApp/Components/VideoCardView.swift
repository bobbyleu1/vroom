import SwiftUI
import AVKit

struct VideoCardView: View {
    let post: Post
    let isCurrentVideo: Bool
    let onLike: () -> Void
    
    @State private var player: AVPlayer?
    @State private var showHeart = false
    @State private var isLiked = false
    @State private var showComments = false
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Video/Image Player
                if post.fileType == "video" {
                    VideoPlayer(player: player)
                        .onAppear {
                            setupPlayer()
                        }
                        .onChange(of: isCurrentVideo) { _, newValue in
                            if newValue {
                                player?.play()
                            } else {
                                player?.pause()
                            }
                        }
                } else {
                    AsyncImage(url: URL(string: post.mediaUrl)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        ProgressView()
                    }
                }
                
                // Animated Heart
                if showHeart {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 100))
                        .foregroundColor(.white)
                        .scaleEffect(showHeart ? 1.0 : 0.0)
                        .opacity(showHeart ? 1.0 : 0.0)
                        .animation(.spring(response: 0.5, dampingFraction: 0.6), value: showHeart)
                }
                
                // Overlay Content
                VStack {
                    Spacer()
                    
                    HStack(alignment: .bottom) {
                        // Left side - User info and caption
                        VStack(alignment: .leading, spacing: 8) {
                            if let username = post.profiles?.username {
                                Text("@\(username)")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                    .shadow(radius: 2)
                            }
                            
                            if let content = post.content {
                                Text(content)
                                    .font(.body)
                                    .foregroundColor(.white)
                                    .lineLimit(2)
                                    .shadow(radius: 2)
                            }
                        }
                        
                        Spacer()
                        
                        // Right side - Action buttons
                        VStack(spacing: 20) {
                            // Avatar
                            if let avatarUrl = post.profiles?.avatarUrl {
                                AsyncImage(url: URL(string: avatarUrl)) { image in
                                    image
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Circle()
                                        .fill(Color.gray)
                                }
                                .frame(width: 50, height: 50)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(Color.blue, lineWidth: 2))
                            }
                            
                            // Like button
                            Button(action: {
                                onLike()
                                isLiked.toggle()
                            }) {
                                VStack(spacing: 4) {
                                    Image(systemName: isLiked ? "heart.fill" : "heart")
                                        .font(.title2)
                                        .foregroundColor(isLiked ? .red : .white)
                                    
                                    Text("\(post.likeCount)")
                                        .font(.caption)
                                        .foregroundColor(.white)
                                }
                            }
                            
                            // Comment button
                            Button(action: {
                                showComments = true
                            }) {
                                VStack(spacing: 4) {
                                    Image(systemName: "message")
                                        .font(.title2)
                                        .foregroundColor(.white)
                                    
                                    Text("\(post.commentCount)")
                                        .font(.caption)
                                        .foregroundColor(.white)
                                }
                            }
                            
                            // Share button
                            Button(action: {
                                // Handle share
                            }) {
                                VStack(spacing: 4) {
                                    Image(systemName: "arrowshape.turn.up.right")
                                        .font(.title2)
                                        .foregroundColor(.white)
                                    
                                    Text("Share")
                                        .font(.caption)
                                        .foregroundColor(.white)
                                }
                            }
                        }
                        .padding(.trailing)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 100)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
            .onTapGesture(count: 2) {
                // Double tap to like
                if !isLiked {
                    onLike()
                    isLiked = true
                }
                
                // Show heart animation
                showHeart = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    showHeart = false
                }
            }
        }
        .sheet(isPresented: $showComments) {
            CommentsView(postId: post.id)
        }
    }
    
    private func setupPlayer() {
        guard post.fileType == "video", let url = URL(string: post.mediaUrl) else { return }
        
        player = AVPlayer(url: url)
        player?.actionAtItemEnd = .none
        
        // Loop video
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem,
            queue: .main
        ) { _ in
            player?.seek(to: .zero)
            if isCurrentVideo {
                player?.play()
            }
        }
    }
}

#Preview {
    VideoCardView(
        post: Post(
            id: "1",
            content: "Test post",
            mediaUrl: "https://example.com/video.mp4",
            fileType: "video",
            authorId: "user1",
            createdAt: Date(),
            likeCount: 42,
            commentCount: 5,
            profiles: Profile(
                id: "user1",
                username: "testuser",
                avatarUrl: nil,
                firstName: "Test",
                lastName: "User",
                bio: nil,
                createdAt: Date()
            )
        ),
        isCurrentVideo: true,
        onLike: {}
    )
}