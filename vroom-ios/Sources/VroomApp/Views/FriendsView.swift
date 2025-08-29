import SwiftUI

struct FriendsView: View {
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack {
                    Text("Friends")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    Text("Friends feature coming soon!")
                        .foregroundColor(.gray)
                    
                    Spacer()
                }
            }
            .navigationTitle("Friends")
            .navigationBarHidden(true)
        }
    }
}

#Preview {
    FriendsView()
}