import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            FeedView()
                .tabItem {
                    Image(systemName: "house")
                    Text("Feed")
                }
            
            FriendsView()
                .tabItem {
                    Image(systemName: "person.2")
                    Text("Friends")
                }
            
            CameraView()
                .tabItem {
                    Image(systemName: "plus.circle.fill")
                    Text("Camera")
                }
            
            MoreView()
                .tabItem {
                    Image(systemName: "ellipsis")
                    Text("More")
                }
            
            ProfileView()
                .tabItem {
                    Image(systemName: "person.circle")
                    Text("Profile")
                }
        }
        .accentColor(.blue)
        .preferredColorScheme(.dark)
    }
}

#Preview {
    MainTabView()
}