import Foundation
import Supabase

class SupabaseService: ObservableObject {
    static let shared = SupabaseService()
    
    private let client: SupabaseClient
    
    private init() {
        let url = URL(string: "https://rafyqmwbbagsdugwjaxx.supabase.co")!
        let key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZnlxbXdiYmFnc2R1Z3dqYXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMzkyODYsImV4cCI6MjA2NjkxNTI4Nn0.IpXi0nO_5tzj_zcap211dRes-dozqX2kmpmGI585X0g"
        
        self.client = SupabaseClient(supabaseURL: url, supabaseKey: key)
    }
    
    // MARK: - Authentication
    
    func signIn(email: String, password: String) async throws -> User {
        let session = try await client.auth.signIn(email: email, password: password)
        return session.user
    }
    
    func signUp(email: String, password: String) async throws -> User {
        let session = try await client.auth.signUp(email: email, password: password)
        return session.user
    }
    
    func signOut() async throws {
        try await client.auth.signOut()
    }
    
    func getCurrentUser() async throws -> User? {
        let session = try await client.auth.session
        return session.user
    }
    
    // MARK: - Posts
    
    func fetchPosts() async throws -> [Post] {
        let posts: [Post] = try await client
            .from("posts")
            .select("*, profiles(*)")
            .order("created_at", ascending: false)
            .execute()
            .value
        
        return posts
    }
    
    func createPost(content: String?, mediaUrl: String, fileType: String) async throws -> Post {
        guard let user = try await getCurrentUser() else {
            throw SupabaseError.userNotAuthenticated
        }
        
        let post = Post(
            id: UUID().uuidString,
            content: content,
            mediaUrl: mediaUrl,
            fileType: fileType,
            authorId: user.id.uuidString,
            createdAt: Date(),
            likeCount: 0,
            commentCount: 0,
            profiles: nil
        )
        
        let createdPost: Post = try await client
            .from("posts")
            .insert(post)
            .select("*, profiles(*)")
            .single()
            .execute()
            .value
        
        return createdPost
    }
    
    // MARK: - Likes
    
    func toggleLike(postId: String) async throws {
        guard let user = try await getCurrentUser() else {
            throw SupabaseError.userNotAuthenticated
        }
        
        // Check if already liked
        let existingLike: [PostLike] = try await client
            .from("post_likes")
            .select("*")
            .eq("user_id", value: user.id.uuidString)
            .eq("post_id", value: postId)
            .execute()
            .value
        
        if existingLike.isEmpty {
            // Add like
            let like = PostLike(userId: user.id.uuidString, postId: postId)
            try await client
                .from("post_likes")
                .insert(like)
                .execute()
        } else {
            // Remove like
            try await client
                .from("post_likes")
                .delete()
                .eq("user_id", value: user.id.uuidString)
                .eq("post_id", value: postId)
                .execute()
        }
    }
    
    func hasLiked(postId: String) async throws -> Bool {
        guard let user = try await getCurrentUser() else {
            return false
        }
        
        let likes: [PostLike] = try await client
            .from("post_likes")
            .select("*")
            .eq("user_id", value: user.id.uuidString)
            .eq("post_id", value: postId)
            .execute()
            .value
        
        return !likes.isEmpty
    }
    
    // MARK: - Comments
    
    func fetchComments(postId: String) async throws -> [Comment] {
        let comments: [Comment] = try await client
            .from("comments")
            .select("*, profiles(*)")
            .eq("post_id", value: postId)
            .order("created_at", ascending: true)
            .execute()
            .value
        
        return comments
    }
    
    func createComment(postId: String, content: String) async throws -> Comment {
        guard let user = try await getCurrentUser() else {
            throw SupabaseError.userNotAuthenticated
        }
        
        let comment = Comment(
            id: UUID().uuidString,
            content: content,
            postId: postId,
            userId: user.id.uuidString,
            createdAt: Date(),
            profiles: nil
        )
        
        let createdComment: Comment = try await client
            .from("comments")
            .insert(comment)
            .select("*, profiles(*)")
            .single()
            .execute()
            .value
        
        return createdComment
    }
}

// MARK: - Supporting Models

struct PostLike: Codable {
    let userId: String
    let postId: String
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case postId = "post_id"
    }
}

enum SupabaseError: Error {
    case userNotAuthenticated
}