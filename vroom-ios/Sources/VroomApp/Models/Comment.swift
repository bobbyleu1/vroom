import Foundation

struct Comment: Codable, Identifiable {
    let id: String
    let content: String
    let postId: String
    let userId: String
    let createdAt: Date
    let profiles: Profile?
    
    enum CodingKeys: String, CodingKey {
        case id
        case content
        case postId = "post_id"
        case userId = "user_id"
        case createdAt = "created_at"
        case profiles
    }
}