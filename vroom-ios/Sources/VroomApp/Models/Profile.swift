import Foundation

struct Profile: Codable, Identifiable {
    let id: String
    let username: String?
    let avatarUrl: String?
    let firstName: String?
    let lastName: String?
    let bio: String?
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case username
        case avatarUrl = "avatar_url"
        case firstName = "first_name"
        case lastName = "last_name"
        case bio
        case createdAt = "created_at"
    }
}