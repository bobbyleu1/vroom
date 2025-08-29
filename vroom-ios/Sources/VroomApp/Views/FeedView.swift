import SwiftUI

struct FeedView: View {
    @StateObject private var viewModel = FeedViewModel()
    @State private var currentIndex = 0
    
    var body: some View {
        GeometryReader { geometry in
            if viewModel.isLoading && viewModel.posts.isEmpty {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            } else if viewModel.posts.isEmpty {
                Text("No posts available")
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            } else {
                TabView(selection: $currentIndex) {
                    ForEach(Array(viewModel.posts.enumerated()), id: \.element.id) { index, post in
                        VideoCardView(
                            post: post,
                            isCurrentVideo: index == currentIndex,
                            onLike: {
                                Task {
                                    await viewModel.toggleLike(for: post)
                                }
                            }
                        )
                        .tag(index)
                    }
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                .ignoresSafeArea()
            }
        }
        .background(Color.black)
        .task {
            await viewModel.loadPosts()
        }
        .refreshable {
            await viewModel.refreshPosts()
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }
}

#Preview {
    FeedView()
}