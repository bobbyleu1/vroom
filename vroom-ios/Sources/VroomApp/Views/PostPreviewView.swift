import SwiftUI
import AVKit

struct PostPreviewView: View {
    let image: UIImage?
    let videoURL: URL?
    let onDismiss: () -> Void
    
    @State private var caption = ""
    @State private var isUploading = false
    @Environment(\.dismiss) private var dismiss
    
    init(image: UIImage, onDismiss: @escaping () -> Void) {
        self.image = image
        self.videoURL = nil
        self.onDismiss = onDismiss
    }
    
    init(videoURL: URL, onDismiss: @escaping () -> Void) {
        self.image = nil
        self.videoURL = videoURL
        self.onDismiss = onDismiss
    }
    
    var body: some View {
        NavigationView {
            VStack {
                // Media Preview
                if let image = image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 400)
                } else if let videoURL = videoURL {
                    VideoPlayer(player: AVPlayer(url: videoURL))
                        .frame(height: 400)
                }
                
                // Caption Input
                VStack(alignment: .leading, spacing: 10) {
                    Text("Caption")
                        .font(.headline)
                    
                    TextField("Write a caption...", text: $caption, axis: .vertical)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .lineLimit(3...6)
                }
                .padding()
                
                Spacer()
                
                // Post Button
                Button(action: {
                    Task {
                        await uploadPost()
                    }
                }) {
                    if isUploading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Share Post")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                .disabled(isUploading)
                .padding()
            }
            .navigationTitle("New Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        onDismiss()
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func uploadPost() async {
        isUploading = true
        
        // TODO: Implement actual upload to Supabase storage
        // This would involve:
        // 1. Upload media to Supabase storage
        // 2. Get public URL
        // 3. Create post with URL and caption
        
        // For now, just simulate upload
        try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        
        isUploading = false
        onDismiss()
        dismiss()
    }
}

#Preview {
    PostPreviewView(
        image: UIImage(systemName: "photo")!,
        onDismiss: {}
    )
}