import Foundation
import Combine

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let supabaseService = SupabaseService.shared
    private var cancellables = Set<AnyCancellable>()
    
    func loadPosts() async {
        isLoading = true
        errorMessage = nil
        
        do {
            posts = try await supabaseService.fetchPosts()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func refreshPosts() async {
        await loadPosts()
    }
    
    func toggleLike(for post: Post) async {
        do {
            try await supabaseService.toggleLike(postId: post.id)
            // Refresh posts to get updated like count
            await loadPosts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}