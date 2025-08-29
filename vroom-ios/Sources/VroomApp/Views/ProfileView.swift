import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var userPosts: [Post] = []
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack {
                    // Profile Header
                    VStack(spacing: 15) {
                        // Avatar placeholder
                        Circle()
                            .fill(Color.gray)
                            .frame(width: 100, height: 100)
                            .overlay(
                                Image(systemName: "person.fill")
                                    .font(.system(size: 50))
                                    .foregroundColor(.white)
                            )
                        
                        // User info
                        if let user = authViewModel.currentUser {
                            Text(user.email ?? "User")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                        }
                        
                        // Stats
                        HStack(spacing: 30) {
                            VStack {
                                Text("\(userPosts.count)")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                Text("Posts")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            
                            VStack {
                                Text("0")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                Text("Followers")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            
                            VStack {
                                Text("0")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                Text("Following")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                        }
                        
                        // Edit Profile Button
                        Button(action: {
                            // Edit profile action
                        }) {
                            Text("Edit Profile")
                                .foregroundColor(.white)
                                .frame(width: 120, height: 35)
                                .background(Color.gray.opacity(0.3))
                                .cornerRadius(8)
                        }
                    }
                    .padding(.top, 20)
                    
                    Divider()
                        .background(Color.gray)
                        .padding(.vertical, 20)
                    
                    // Posts Grid
                    ScrollView {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 2) {
                            ForEach(userPosts) { post in
                                AsyncImage(url: URL(string: post.mediaUrl)) { image in
                                    image
                                        .resizable()
                                        .aspectRatio(1, contentMode: .fill)
                                } placeholder: {
                                    Rectangle()
                                        .fill(Color.gray)
                                        .aspectRatio(1, contentMode: .fit)
                                }
                                .clipped()
                            }
                        }
                    }
                    
                    Spacer()
                }
                .padding(.horizontal)
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") {
                        Task {
                            await authViewModel.signOut()
                        }
                    }
                    .foregroundColor(.red)
                }
            }
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(AuthViewModel())
}