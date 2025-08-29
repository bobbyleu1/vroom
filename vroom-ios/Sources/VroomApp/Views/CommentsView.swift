import SwiftUI

struct CommentsView: View {
    let postId: String
    @State private var comments: [Comment] = []
    @State private var newCommentText = ""
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                // Comments list
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 15) {
                        ForEach(comments) { comment in
                            CommentRowView(comment: comment)
                        }
                    }
                    .padding()
                }
                
                Divider()
                
                // Comment input
                HStack {
                    TextField("Add a comment...", text: $newCommentText)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                    
                    Button("Post") {
                        Task {
                            await postComment()
                        }
                    }
                    .disabled(newCommentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
            }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadComments()
        }
    }
    
    private func loadComments() async {
        do {
            comments = try await SupabaseService.shared.fetchComments(postId: postId)
        } catch {
            print("Failed to load comments: \(error)")
        }
    }
    
    private func postComment() async {
        let trimmedText = newCommentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        
        do {
            let newComment = try await SupabaseService.shared.createComment(postId: postId, content: trimmedText)
            comments.append(newComment)
            newCommentText = ""
        } catch {
            print("Failed to post comment: \(error)")
        }
    }
}

struct CommentRowView: View {
    let comment: Comment
    
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Avatar
            AsyncImage(url: URL(string: comment.profiles?.avatarUrl ?? "")) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                Circle()
                    .fill(Color.gray)
                    .overlay(
                        Image(systemName: "person.fill")
                            .foregroundColor(.white)
                    )
            }
            .frame(width: 30, height: 30)
            .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 2) {
                Text(comment.profiles?.username ?? "Unknown")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.blue)
                
                Text(comment.content)
                    .font(.body)
                    .foregroundColor(.primary)
                
                Text(comment.createdAt, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
    }
}

#Preview {
    CommentsView(postId: "test-post-id")
}