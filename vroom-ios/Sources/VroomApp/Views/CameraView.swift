import SwiftUI
import AVFoundation

struct CameraView: View {
    @State private var showCamera = false
    @State private var showImagePicker = false
    @State private var selectedImage: UIImage?
    @State private var selectedVideoURL: URL?
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 30) {
                Text("Create Post")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                
                VStack(spacing: 20) {
                    Button(action: {
                        showCamera = true
                    }) {
                        HStack {
                            Image(systemName: "camera")
                            Text("Take Photo/Video")
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.blue)
                        .cornerRadius(10)
                    }
                    
                    Button(action: {
                        showImagePicker = true
                    }) {
                        HStack {
                            Image(systemName: "photo.on.rectangle")
                            Text("Choose from Library")
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.gray)
                        .cornerRadius(10)
                    }
                }
                .padding(.horizontal, 40)
                
                Spacer()
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPickerView(
                selectedImage: $selectedImage,
                selectedVideoURL: $selectedVideoURL
            )
        }
        .sheet(isPresented: $showImagePicker) {
            ImagePickerView(
                selectedImage: $selectedImage,
                selectedVideoURL: $selectedVideoURL
            )
        }
        .sheet(isPresented: .constant(selectedImage != nil || selectedVideoURL != nil)) {
            if let image = selectedImage {
                PostPreviewView(image: image) {
                    selectedImage = nil
                }
            } else if let videoURL = selectedVideoURL {
                PostPreviewView(videoURL: videoURL) {
                    selectedVideoURL = nil
                }
            }
        }
    }
}

#Preview {
    CameraView()
}