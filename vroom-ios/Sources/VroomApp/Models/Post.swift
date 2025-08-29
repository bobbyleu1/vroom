import Foundation

struct Post: Codable, Identifiable {
    let id: String
    let content: String?
    let mediaUrl: String
    let fileType: String
    let authorId: String
    let createdAt: Date
    let likeCount: Int
    let commentCount: Int
    let profiles: Profile?
    
    enum CodingKeys: String, CodingKey {
        case id
        case content
        case mediaUrl = "media_url"
        case fileType = "file_type"
        case authorId = "author_id"
        case createdAt = "created_at"
        case likeCount = "like_count"
        case commentCount = "comment_count"
        case profiles
    }
}